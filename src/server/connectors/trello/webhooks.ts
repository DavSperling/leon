import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { withTenant } from '@/server/db/with-tenant';
import { env } from '@/server/env';
import { logError } from '@/server/log';
import type { LoadedConnection } from '../connections';
import { connectorHttp } from '../pipedream';
import type { AnyConnector } from '../types';
import { type TrelloClient, trelloClient } from './client';

// Trello prévient Leon dès que quelque chose change dans un tableau : l'alerte rend la connexion due, au plus une
// minute après le début de sa relève précédente (webhook_trello, 0101), et la relève lit le nouveau comme d'habitude,
// au lieu d'attendre son quart d'heure. Leon ne lit rien de l'alerte elle-même. Seulement pour une connexion par bouton : Trello signe ses alertes avec le secret de
// l'appli OAuth de Leon. Une connexion par clé n'a pas de webhook, et sa relève reste celle du quart d'heure.
//
// Doc lue le 27/11/2026 :
//   https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/
//     création par POST https://api.trello.com/1/webhooks avec le jeton en Bearer (callbackURL, idModel, description),
//     read:board:trello pour un tableau ; Trello essaie d'abord callbackURL par un HEAD, qui doit répondre 200, sinon
//     pas de webhook ; certificat valide, port 443 seulement ; signature : en-tête X-Trello-Webhook, base64 du
//     HMAC-SHA1 du corps complet suivi de la callbackURL telle que donnée à la création, avec le secret du client
//     OAuth 2.0 ; trois nouvelles tentatives (30, 60 et 120 s), puis plus rien ; une réponse 410 retire le webhook ;
//     Trello retire aussi ceux d'un accès révoqué (pas à l'expiration du jeton d'accès), et coupe un webhook qui
//     échoue depuis 30 jours.
//   https://developer.atlassian.com/cloud/trello/rest/api-group-webhooks/ (POST /webhooks : callbackURL et idModel
//     requis, description facultative ; réponse { id, description, idModel, callbackURL, active, … })
//
// Non vérifié (aucun essai réel) : un corps hors ASCII (la doc parle de la « représentation binaire » du corps et son
// exemple signe la chaîne en UTF-8 : Leon signe les octets reçus) ; que POST /1/webhooks accepte ses paramètres en
// JSON (l'exemple de la référence les met dans l'adresse) ; le délai réel des alertes.
// shortcut: un webhook n'est créé que pour un tableau qui n'en a pas dans webhooks_trello ; celui que Trello a retiré
// (accès révoqué puis « Reconnecter », 30 jours d'échecs) n'est pas refait, et un refus de Trello est retenté et
// journalisé à chaque relève. Vérifier chaque webhook une fois par jour (GET /1/webhooks/{id}), avec un délai après un
// refus comme pour Microsoft, si des alertes manquent ou si le journal se remplit.
// shortcut: les webhooks des tableaux fermés ne sont pas retirés ; ceux d'une connexion supprimée meurent à leur
// première alerte, par le 410.

export const WEBHOOKS_PATH = '/api/trello/webhooks';

// L'adresse des alertes : celle de Leon, en https seulement (Trello vérifie le certificat) ; en local, aucune. Celle
// d'un webhook y ajoute son jeton : « …/api/trello/webhooks/<jeton> ».
export function webhooksUrl(base: string = env.BETTER_AUTH_URL): string | null {
  const url = new URL(WEBHOOKS_PATH, base);
  return url.protocol === 'https:' ? url.toString() : null;
}

async function watchedBoards(ctx: TenantContext, connectionId: string): Promise<Set<string>> {
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<{ tableau: string }>(
      sql`select tableau from webhooks_trello where connection_id = ${connectionId}`,
    ),
  );
  return new Set(rows.map((row) => row.tableau));
}

// Le jeton opaque de l'adresse n'est gardé que par son empreinte. Une ligne déjà là (une autre relève l'a posée
// entre-temps) laisse ce webhook-ci sans jeton connu : il meurt à sa première alerte, par le 410.
async function watch(
  ctx: TenantContext,
  connectionId: string,
  trello: TrelloClient,
  board: string,
  url: string,
): Promise<void> {
  const jeton = randomBytes(32).toString('base64url');
  const { id } = await trello.createWebhook(board, `${url}/${jeton}`);
  await withTenant(ctx, (tx) =>
    tx.execute(sql`insert into webhooks_trello (id, tenant_id, connection_id, tableau, empreinte)
      values (${id}, ${ctx.tenantId}, ${connectionId}, ${board},
        sha256(convert_to(${jeton}, 'UTF8')))
      on conflict do nothing`),
  );
}

// À la fin d'une relève réussie d'une connexion par bouton, sous sa réservation : un webhook par tableau ouvert qui
// n'en a pas encore. Une erreur est journalisée sans arrêter la relève ; la suivante réessaie. `publicUrl` : tests.
export async function keepTrelloWebhooks(
  ctx: TenantContext,
  connection: Pick<LoadedConnection, 'id' | 'provider' | 'config'>,
  connector: AnyConnector,
  deps: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; publicUrl?: string },
): Promise<void> {
  const { authMode, accessToken } = connection.config;
  const button = connection.provider === 'trello' && authMode === 'oauth';
  const url = webhooksUrl(deps.publicUrl);
  if (!button || typeof accessToken !== 'string' || !url) return;
  const ids = { connectionId: connection.id, provider: connection.provider };
  try {
    const watched = await watchedBoards(ctx, connection.id);
    const http = connectorHttp(connection.provider, connector, connection.config, deps);
    const trello = trelloClient({ authMode: 'oauth', accessToken }, http);
    for (const board of await trello.boards()) {
      if (watched.has(board.id)) continue;
      await watch(ctx, connection.id, trello, board.id, url).catch((error) =>
        logError('trello.webhook_failed', error, ids),
      );
    }
  } catch (error) {
    logError('trello.webhook_failed', error, ids);
  }
}

// La signature de Trello : base64 du HMAC-SHA1 des octets reçus suivis de l'adresse de rappel, avec le secret de
// l'appli, comparée en temps constant.
export function signedByTrello(
  body: Uint8Array,
  callbackURL: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac('sha1', secret).update(body).update(callbackURL).digest();
  const given = Buffer.from(signature, 'base64');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Une alerte signée, sans session : rend due la connexion de son jeton (webhook_trello, 0101). false : jeton inconnu.
export async function markTrelloAlert(jeton: string): Promise<boolean> {
  const { rows } = await db.execute<{ connection_id: string }>(
    sql`select connection_id from webhook_trello(sha256(convert_to(${jeton}, 'UTF8')))`,
  );
  return rows.length > 0;
}
