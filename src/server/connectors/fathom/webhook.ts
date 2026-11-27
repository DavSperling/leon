import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { withTenant } from '@/server/db/with-tenant';
import { env } from '@/server/env';
import { logError } from '@/server/log';
import type { LoadedConnection } from '../connections';
import { ConnectorHttpError } from '../http';
import { connectorHttp } from '../pipedream';
import type { AnyConnector } from '../types';

// Fathom prévient Leon dès qu'une réunion est prête : son alerte (un webhook) rend la connexion due tout de suite
// (alerte_fathom, 0102) et la relève lit la réunion comme d'habitude, au lieu d'attendre son quart d'heure. L'alerte se
// crée seule, avec la clé de la personne, à la première relève réussie. La relève du quart d'heure reste le filet.
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
//     DELETE /webhooks/{id} (204) ; aucune liste.
//
// Non vérifié (aucun essai réel) : qu'une offre sans équipe refuse les valeurs d'équipe de triggered_for (un 400 les fait
// retirer) ; le délai entre la fin d'une réunion et l'alerte ; que Fathom accepte l'adresse sans l'appeler à la
// création ; qu'une alerte survive au remplacement de la clé qui l'a créée (sinon, la relève du quart d'heure seule).
//
// shortcut: la signature de Fathom n'est pas vérifiée et son secret n'est pas gardé : le jeton de 256 bits de l'adresse
// fait foi, comme le clientState de Microsoft, et une adresse divulguée ne permet que de déclencher une relève. Garder le
// secret chiffré et vérifier webhook-signature si une alerte doit un jour porter du contenu.
// shortcut: le webhook n'est pas retiré chez Fathom quand la connexion est supprimée : il appelle alors une adresse
// inconnue, qui répond 200 sans rien faire. Le retirer avec l'id gardé (DELETE /webhooks/{id}) avant de supprimer la
// connexion, si Fathom s'en plaint ou si les alertes orphelines s'accumulent.
// shortcut: une création refusée est redemandée à chaque relève, et journalisée chaque fois ; garder le refus un jour,
// comme Microsoft, si Sentry en montre.

export const WEBHOOKS_PATH = '/api/fathom/webhooks';
const WEBHOOKS = 'https://api.fathom.ai/external/v1/webhooks';
// Les enregistrements de la personne et ceux qu'on lui partage ; ceux de son équipe, sur une offre Équipe.
const EVERY_PLAN = ['my_recordings', 'shared_external_recordings'];
const TEAM_PLAN = ['my_shared_with_team_recordings', 'shared_team_recordings'];
// Le jeton de l'adresse : 32 octets en base64url.
const TOKEN = /^[\w-]{43}$/;

const WebhookSchema = z.object({ id: z.string().min(1).max(200) });

type Ready = { connector: AnyConnector; config: Record<string, unknown> };
type Deps = { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; publicUrl?: string };

// À la fin d'une relève réussie, sous sa réservation : crée l'alerte d'une connexion Fathom qui n'en a pas. Une erreur
// est journalisée sans arrêter la relève ; la suivante réessaie. `publicUrl` : tests.
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
    const { rows } = await withTenant(ctx, (tx) =>
      tx.execute(sql`select 1 from alertes_fathom where connection_id = ${connection.id}`),
    );
    if (rows.length > 0) return;
    const jeton = randomBytes(32).toString('base64url');
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
        },
        WebhookSchema,
      );
    const { id } = await create([...EVERY_PLAN, ...TEAM_PLAN]).catch((error: unknown) => {
      if (error instanceof ConnectorHttpError && error.status === 400) return create(EVERY_PLAN);
      throw error;
    });
    await withTenant(ctx, (tx) =>
      tx.execute(sql`insert into alertes_fathom (connection_id, tenant_id, id, empreinte)
        values (${connection.id}, ${ctx.tenantId}, ${id}, sha256(convert_to(${jeton}, 'UTF8')))`),
    );
  } catch (error) {
    logError('fathom.webhook_failed', error, { connectionId: connection.id });
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
