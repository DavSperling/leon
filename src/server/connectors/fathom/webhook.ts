import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { withTenant } from '@/server/db/with-tenant';
import { env } from '@/server/env';
import { logError } from '@/server/log';
import { type LoadedConnection, loadManageableConfig } from '../connections';
import { ConnectorAuthError, ConnectorHttpError, createConnectorHttp } from '../http';
import { connectorHttp } from '../pipedream';
import type { AnyConnector } from '../types';

// Fathom prévient Leon dès qu'une réunion est prête : son alerte (un webhook) rend la connexion due tout de suite
// (alerte_fathom, 0102) et la relève lit la réunion comme d'habitude, au lieu d'attendre son quart d'heure. L'alerte se
// crée seule, avec la clé de la personne, à la première relève réussie, et se retire avec la connexion
// (deleteConnectionAction). La relève du quart d'heure reste le filet.
//
// Doc lue le 27/11/2026 :
//   https://developers.fathom.ai/api-reference/webhooks/create-a-webhook.md : POST /webhooks avec la clé (X-Api-Key),
//     destination_url et triggered_for obligatoires, au moins un des include_* à vrai ; le 201 rend l'id et le secret.
//     triggered_for : my_recordings et shared_external_recordings sur toutes les offres, my_shared_with_team_recordings
//     et shared_team_recordings sur les offres Équipe seulement.
//   https://developers.fathom.ai/webhooks.md : signature « Standard Webhooks » (webhook-id, webhook-timestamp,
//     webhook-signature, HMAC-SHA256 avec le secret whsec_…).
//   https://developers.fathom.ai/faq.md : un seul événement, une fois par réunion, quand son contenu est prêt (sans
//     résumé, pas d'alerte) ; un code hors 2xx ou un délai dépassé peut faire réessayer ; l'id n'est rendu qu'à la
//     création, sans liste ensuite ; la charge ne dit pas à quelle clé l'alerte appartient, d'où une adresse par
//     connexion ; pas d'en-tête à soi.
//   https://developers.fathom.ai/api-reference/openapi.yaml : « Return any 2xx code to acknowledge receipt » ;
//     DELETE /webhooks/{id} avec la clé (204 ; 404 pour une alerte inconnue) ; aucune liste.
//
// Non vérifié (aucun essai réel) : qu'une offre sans équipe refuse les valeurs d'équipe de triggered_for (un 400 les fait
// retirer) ; le délai entre la fin d'une réunion et l'alerte ; que Fathom accepte l'adresse sans l'appeler à la
// création ; qu'une alerte survive au remplacement de la clé qui l'a créée (sinon, la relève du quart d'heure seule), et
// que la nouvelle clé puisse la retirer ; le type de l'id rendu (texte ou nombre : les deux sont gardés en texte).
//
// shortcut: la signature de Fathom n'est pas vérifiée et son secret n'est pas gardé : le jeton de 256 bits de l'adresse
// fait foi, comme le clientState de Microsoft, et une adresse divulguée ne permet que de déclencher une relève. Garder le
// secret chiffré et vérifier webhook-signature si une alerte doit un jour porter du contenu.
// shortcut: un compte ou un espace supprimé (cascade SQL) laisse ses alertes chez Fathom, qui appellent une adresse
// devenue inconnue (200, rien n'est lu) ; les retirer aussi dans runDeletion (réglages), comme les comptes Pipedream,
// avant d'ouvrir Fathom à des clients.
// shortcut: une création refusée est redemandée à chaque relève, et journalisée chaque fois ; garder le refus un jour,
// comme Microsoft, si Sentry en montre.
// shortcut: une création sans réponse nette (réseau, 5xx, réponse illisible) garde sa ligne « en-creation », sans nouvel
// essai, pour ne jamais doubler l'alerte : elle manque peut-être (Leon reste sur la relève du quart d'heure), ou existe
// sans id à retirer avec la connexion. Rebrancher Fathom la redemande ; y revenir si Sentry en montre.

export const WEBHOOKS_PATH = '/api/fathom/webhooks';
const WEBHOOKS = 'https://api.fathom.ai/external/v1/webhooks';
// Les enregistrements de la personne et ceux qu'on lui partage ; ceux de son équipe, sur une offre Équipe.
const EVERY_PLAN = ['my_recordings', 'shared_external_recordings'];
const TEAM_PLAN = ['my_shared_with_team_recordings', 'shared_team_recordings'];
// Le jeton de l'adresse : 32 octets en base64url.
const TOKEN = /^[\w-]{43}$/;
// Le retrait d'une alerte, que la personne attend en supprimant sa connexion.
const FORGET_TIMEOUT_MS = 5_000;
// L'id d'une alerte demandée à Fathom dont la réponse n'a pas été lue.
const PENDING = 'en-creation';

const WebhookSchema = z.object({
  id: z.union([z.string().min(1).max(200), z.number()]).transform(String),
});

type Ready = { connector: AnyConnector; config: Record<string, unknown> };
type Deps = { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; publicUrl?: string };

// À la fin d'une relève réussie, sous sa réservation : crée l'alerte d'une connexion Fathom qui n'en a pas. Sa ligne est
// posée avant la demande, avec un id provisoire : une alerte créée chez Fathom a toujours la sienne, et une réponse
// perdue ou illisible ne la fait jamais redemander, donc jamais doubler. Seul un refus net retire la ligne, et la relève
// suivante redemande. Une erreur est journalisée sans arrêter la relève. `publicUrl` : tests.
export async function keepFathomAlerted(
  ctx: TenantContext,
  connection: Pick<LoadedConnection, 'id' | 'provider'>,
  ready: Ready,
  deps: Deps,
): Promise<void> {
  if (connection.provider !== 'fathom') return;
  // L'adresse de Leon, en https seulement comme celle de Microsoft (notificationUrl) : en local, aucune.
  const base = new URL(WEBHOOKS_PATH, deps.publicUrl ?? env.BETTER_AUTH_URL);
  if (base.protocol !== 'https:') return;
  try {
    const jeton = randomBytes(32).toString('base64url');
    const { rows } = await withTenant(ctx, (tx) =>
      tx.execute(sql`insert into alertes_fathom (connection_id, tenant_id, id, empreinte)
        values (${connection.id}, ${ctx.tenantId}, ${PENDING}, sha256(convert_to(${jeton}, 'UTF8')))
        on conflict (connection_id) do nothing returning 1`),
    );
    if (rows.length === 0) return; // elle a déjà son alerte, ou l'a demandée
    const http = connectorHttp(connection.provider, ready.connector, ready.config, deps);
    const create = (triggers: string[]) =>
      http.json(
        {
          url: WEBHOOKS,
          method: 'POST',
          headers: { 'X-Api-Key': String(ready.config.apiKey) },
          // Fathom veut au moins un des include_* : les actions à mener seulement, car l'alerte n'est pas lue.
          body: {
            destination_url: `${base}/${jeton}`,
            triggered_for: triggers,
            include_action_items: true,
          },
          once: true, // une réponse perdue a pu créer l'alerte : jamais rejouée
        },
        WebhookSchema,
      );
    const { id } = await create([...EVERY_PLAN, ...TEAM_PLAN])
      .catch((error: unknown) => {
        if (error instanceof ConnectorHttpError && error.status === 400) return create(EVERY_PLAN);
        throw error;
      })
      .catch(async (error: unknown) => {
        if (refused(error))
          await withTenant(ctx, (tx) =>
            tx.execute(sql`delete from alertes_fathom where connection_id = ${connection.id}`),
          );
        throw error;
      });
    await withTenant(ctx, (tx) =>
      tx.execute(sql`update alertes_fathom set id = ${id} where connection_id = ${connection.id}`),
    );
  } catch (error) {
    logError('fathom.webhook_failed', error, { connectionId: connection.id });
  }
}

// Un refus net de Fathom (4xx, clé refusée comprise) : il n'a rien créé. Réseau, 5xx ou réponse illisible : peut-être.
function refused(error: unknown): boolean {
  const status =
    error instanceof ConnectorHttpError || error instanceof ConnectorAuthError
      ? error.status
      : null;
  return status !== null && status >= 400 && status < 500;
}

export type FathomAlert = { id: string; apiKey: string };

// Avant la suppression d'une connexion Fathom : l'id de son alerte et la clé qui peut la retirer, lus avant que la ligne
// parte avec la connexion (cascade). Nulle sans alerte ; une erreur (base, clé illisible) est journalisée et ne bloque
// jamais la suppression.
export async function fathomAlertOf(
  ctx: TenantContext,
  connectionId: string,
): Promise<FathomAlert | null> {
  try {
    const { rows } = await withTenant(ctx, (tx) =>
      tx.execute(sql`select id from alertes_fathom where connection_id = ${connectionId}`),
    );
    const id = rows[0]?.id;
    // Une demande dont la réponse n'a pas été lue n'a pas d'id à retirer.
    if (typeof id !== 'string' || id === PENDING) return null;
    const apiKey = (await loadManageableConfig(ctx, connectionId))?.apiKey;
    return typeof apiKey === 'string' ? { id, apiKey } : null;
  } catch (error) {
    logError('fathom.webhook_cleanup_failed', error, { connectionId });
    return null;
  }
}

// Après une suppression réussie : retire l'alerte chez Fathom, qui enverrait sinon sans fin à Leon les actions à mener
// des réunions. Un seul essai, court ; 404 : déjà retirée dans Fathom. Un échec est journalisé (sans la clé : http.ts)
// et ne bloque jamais la suppression.
export async function forgetFathomAlert({ id, apiKey }: FathomAlert): Promise<void> {
  try {
    const http = createConnectorHttp({ provider: 'fathom', hosts: [new URL(WEBHOOKS).host] });
    await http.text({
      url: `${WEBHOOKS}/${encodeURIComponent(id)}`,
      method: 'DELETE',
      headers: { 'X-Api-Key': apiKey },
      acceptStatus: [404],
      once: true,
      timeoutMs: FORGET_TIMEOUT_MS,
    });
  } catch (error) {
    logError('fathom.webhook_cleanup_failed', error, { webhookId: id });
  }
}

// Une alerte reçue sans session ni jeton d'API : seul le jeton de son adresse, comparé en base à l'empreinte gardée,
// rend sa connexion due. Un jeton qui n'a pas la forme de ceux de Leon ne va pas jusqu'à la base.
export async function markAlerted(jeton: string): Promise<boolean> {
  if (!TOKEN.test(jeton)) return false;
  const { rows } = await db.execute(
    sql`select connection_id from alerte_fathom(sha256(convert_to(${jeton}, 'UTF8')))`,
  );
  return rows.length > 0;
}
