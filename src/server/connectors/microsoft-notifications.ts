import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { withTenant } from '@/server/db/with-tenant';
import { env } from '@/server/env';
import { logError } from '@/server/log';
import type { LoadedConnection } from './connections';
import type { ConnectorHttp } from './http';
import { ensureFreshTokens } from './oauth';
import { connectorHttp } from './pipedream';
import type { AnyConnector, GraphWatch } from './types';

// Microsoft prévient Leon dès qu'une ressource suivie change (un mail reçu ou envoyé, l'agenda) : la notification rend
// la connexion due tout de suite (notifications_microsoft, 0096) et la relève lit le nouveau comme d'habitude, au lieu
// d'attendre son quart d'heure. La notification ne porte aucun contenu. La relève du quart d'heure reste le filet.
//
// Doc lue le 27/11/2026 (learn.microsoft.com/graph, sources de microsoftgraph/microsoft-graph-docs-contrib) :
//   change-notifications-delivery-webhooks : une adresse publique en https ; la création envoie ?validationToken=…
//     en POST, à rendre tel quel en text/plain avec un 200 sous 10 s ; une notification veut un 2xx sous 3 s (sinon
//     nouveaux essais pendant 4 h, et une adresse trop lente est bridée) ; le clientState revient avec chaque
//     notification ; un doublon (même ressource, même changeType) est refusé en 409 « Subscription Id <…> already
//     exists » ; le jeton d'accès que Microsoft garde avec l'abonnement expire en général en moins d'une heure, et plus
//     rien n'arrive ensuite (les notifications attendent 4 h au plus) : un renouvellement (PATCH) lui donne le jeton
//     du moment.
//   change-notifications-lifecycle-events : l'adresse du cycle de vie peut être la même ; reauthorizationRequired
//     (toutes les ressources), subscriptionRemoved et missed (courrier et agenda d'Outlook) ; un PATCH renouvelle et
//     réautorise d'un coup.
//   subscription : 10 080 minutes au plus pour le courrier et l'agenda d'Outlook, 4 320 pour les messages de Teams ;
//     clientState de 128 caractères au plus ; lifecycleNotificationUrl obligatoire pour Teams au-delà d'une heure.
//   subscription-post-subscriptions : courrier (Mail.ReadBasic, Mail.Read) et agenda (Calendars.Read) aussi pour un
//     compte personnel.
//
// Non vérifié (aucun essai réel) : le délai réel des notifications et des demandes de réautorisation ; que le
// courrier refuse bien un doublon en 409 ; qu'un mail rangé par une règle hors de la boîte de réception ne prévient
// pas (la relève ne lit de toute façon que la boîte de réception et les éléments envoyés).

export const NOTIFICATIONS_PATH = '/api/microsoft/notifications';
const SUBSCRIPTIONS = 'https://graph.microsoft.com/v1.0/subscriptions';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
// Deux jours : sous les trois jours de Teams et les sept d'Outlook. Le jeton fait de toute façon renouveler chaque heure.
const LIFETIME = 2 * DAY;
// Le renouvellement est dû 20 minutes avant que le jeton donné à Microsoft n'expire : la relève du quart d'heure qui
// suit le fait à temps. Il part avec un jeton qui a encore une demi-heure au moins.
const BEFORE_TOKEN_ENDS = 20 * MINUTE;
const FRESH_TOKEN = 30 * MINUTE;
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const SubscriptionSchema = z.object({ id: z.string().min(1).max(200) });
// Le corps d'un refus accepté (404, 409) : seul son message sert, pour l'identifiant d'un doublon.
const AnswerSchema = z.union([
  SubscriptionSchema,
  z.object({ error: z.object({ message: z.string().optional() }).optional() }),
]);

// L'adresse que Microsoft appelle : celle de Leon, en https seulement (Microsoft refuse le reste) ; en local, aucune.
export function notificationUrl(base: string = env.BETTER_AUTH_URL): string | null {
  const url = new URL(NOTIFICATIONS_PATH, base);
  return url.protocol === 'https:' ? url.toString() : null;
}

type Row = { id: string; ressource: string; due: boolean };

async function readSubscriptions(ctx: TenantContext, connectionId: string) {
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<Row>(sql`select id, ressource, prochain_renouvellement <= now() as due
      from abonnements_microsoft where connection_id = ${connectionId}`),
  );
  return new Map(rows.map((row) => [row.ressource, row]));
}

// Microsoft garde le jeton du renouvellement : un jeton qui expire dans moins d'une demi-heure est d'abord renouvelé.
async function longLivedConfig(
  ctx: TenantContext,
  connection: Pick<LoadedConnection, 'id' | 'provider' | 'config'>,
  connector: AnyConnector,
  deps: { fetchImpl?: typeof fetch },
): Promise<Record<string, unknown>> {
  const expiresAt = Date.parse(String(connection.config.expiresAt));
  if (Number.isNaN(expiresAt) || expiresAt - Date.now() >= FRESH_TOKEN) return connection.config;
  return ensureFreshTokens(ctx, connection, connector, { ...deps, force: true });
}

// 20 minutes avant la fin du jeton donné à Microsoft, et au plus tard un jour avant la fin de l'abonnement.
function renewalDate(expiration: number, config: Record<string, unknown>): Date {
  const tokenEnds = Date.parse(String(config.expiresAt));
  const latest = expiration - DAY;
  return new Date(
    Number.isNaN(tokenEnds) ? latest : Math.min(latest, tokenEnds - BEFORE_TOKEN_ENDS),
  );
}

type Call = { http: ConnectorHttp; headers: Record<string, string> };

// false : Microsoft ne connaît plus l'abonnement (expiré ou retiré), il est à recréer.
async function renew({ http, headers }: Call, id: string, expirationDateTime: string) {
  const url = `${SUBSCRIPTIONS}/${encodeURIComponent(id)}`;
  const body = { expirationDateTime };
  const answer = await http.json(
    { url, method: 'PATCH', headers, body, acceptStatus: [404] },
    AnswerSchema,
  );
  return 'id' in answer;
}

async function create({ http, headers }: Call, body: Record<string, string>): Promise<string> {
  const request = { url: SUBSCRIPTIONS, method: 'POST', headers, body } as const;
  const answer = await http.json({ ...request, acceptStatus: [409] }, AnswerSchema);
  if ('id' in answer) return answer.id;
  // Un abonnement de Leon suit déjà cette ressource pour ce compte (celui d'une connexion supprimée, ou perdu en
  // route) : il est retiré puis refait, pour que ses notifications portent le secret de celui-ci.
  const taken = answer.error?.message?.match(GUID)?.[0];
  if (taken) {
    const url = `${SUBSCRIPTIONS}/${taken}`;
    await http.text({ url, method: 'DELETE', headers, acceptStatus: [404] });
  }
  return (await http.json(request, SubscriptionSchema)).id;
}

async function follow(
  ctx: TenantContext,
  connectionId: string,
  call: Call,
  watch: GraphWatch,
  row: Row | undefined,
  url: string,
  config: Record<string, unknown>,
): Promise<void> {
  const expiration = Date.now() + LIFETIME;
  const expirationDateTime = new Date(expiration).toISOString();
  const next = renewalDate(expiration, config);
  if (row && (await renew(call, row.id, expirationDateTime))) {
    await withTenant(ctx, (tx) =>
      tx.execute(sql`update abonnements_microsoft set prochain_renouvellement = ${next}
        where id = ${row.id}`),
    );
    return;
  }
  const etat = randomBytes(32).toString('base64url');
  const id = await create(call, {
    changeType: watch.changeType,
    notificationUrl: url,
    lifecycleNotificationUrl: url,
    resource: watch.resource,
    expirationDateTime,
    clientState: etat,
  });
  await withTenant(ctx, (tx) =>
    tx.execute(sql`insert into abonnements_microsoft
        (id, tenant_id, connection_id, ressource, empreinte, prochain_renouvellement)
      values (${id}, ${ctx.tenantId}, ${connectionId}, ${watch.resource},
        sha256(convert_to(${etat}, 'UTF8')), ${next})
      on conflict (connection_id, ressource) do update set id = excluded.id,
        empreinte = excluded.empreinte, prochain_renouvellement = excluded.prochain_renouvellement`),
  );
}

// À la fin d'une relève réussie, sous sa réservation : crée les abonnements qui manquent et renouvelle ceux dont c'est
// l'heure. Une erreur est journalisée sans arrêter la relève ; la suivante réessaie. `publicUrl` : tests.
export async function keepNotified(
  ctx: TenantContext,
  connection: Pick<LoadedConnection, 'id' | 'provider' | 'config'>,
  connector: AnyConnector,
  deps: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; publicUrl?: string },
): Promise<void> {
  const url = notificationUrl(deps.publicUrl);
  if (!url || !connector.watch) return;
  const ids = { connectionId: connection.id, provider: connection.provider };
  try {
    const existing = await readSubscriptions(ctx, connection.id);
    const todo = connector.watch.filter((watch) => existing.get(watch.resource)?.due ?? true);
    if (todo.length === 0) return;
    const config = await longLivedConfig(ctx, connection, connector, deps);
    const http = connectorHttp(connection.provider, connector, config, deps);
    const call = { http, headers: { authorization: `Bearer ${String(config.accessToken)}` } };
    for (const watch of todo) {
      const row = existing.get(watch.resource);
      await follow(ctx, connection.id, call, watch, row, url, config).catch((error) =>
        logError('microsoft.subscription_failed', error, ids),
      );
    }
  } catch (error) {
    logError('microsoft.subscription_failed', error, ids);
  }
}

export type MicrosoftNotification = {
  subscriptionId: string;
  clientState?: string | null | undefined;
  lifecycleEvent?: string | null | undefined;
};

// Un lot reçu de Microsoft, sans session ni jeton : seules les notifications au bon clientState comptent (comparé en
// base à l'empreinte de leur abonnement). Rend le nombre de connexions rendues dues.
export async function markNotified(list: MicrosoftNotification[]): Promise<number> {
  const lot = list.flatMap(({ subscriptionId, clientState, lifecycleEvent }) =>
    clientState ? [{ abonnement: subscriptionId, etat: clientState, cycle: !!lifecycleEvent }] : [],
  );
  if (lot.length === 0) return 0;
  const { rows } = await db.execute<{ connection_id: string }>(
    sql`select connection_id from notifications_microsoft(${JSON.stringify(lot)}::jsonb)`,
  );
  return rows.length;
}
