import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { loadMyConnections } from '@/server/connectors/connections';
import { gmailClient } from '@/server/connectors/gmail/client';
import { gmailConnector } from '@/server/connectors/gmail/connector';
import { replyRaw } from '@/server/connectors/gmail/reply';
import { ConnectorHttpError } from '@/server/connectors/http';
import { connectorHttp } from '@/server/connectors/pipedream';
import { sources } from '@/server/db/schema/memory';
import { brouillons, reponsesAgent } from '@/server/db/schema/portrait';
import { withTenant } from '@/server/db/with-tenant';
import { logError } from '@/server/log';
import { EN_SERVICE } from './agents';
import { hasBlank } from './brouillon-prompt';

// Le dépôt d'un brouillon dans les brouillons Gmail de la personne, en réponse dans le fil, juste après qu'un passage
// l'a écrit (brouillons.ts). C'est la seule écriture de Leon dans une boîte : un brouillon de plus. Rien n'est envoyé,
// et rien n'y est supprimé ni modifié, pas même ce brouillon quand elle l'écarte dans Leon.
//
// Un brouillon est déposé si, et seulement si :
// - il est complet : son texte ne porte aucun blanc entre crochets (hasBlank). Un brouillon incomplet reste dans Leon
//   seulement, d'où il ne peut pas partir par erreur ;
// - son fil est un fil Gmail relevé par une connexion Gmail qu'elle a branchée elle-même, par Pipedream, et qui n'est
//   pas en pause (loadMyConnections) : ni le fil d'un collègue, ni une boîte branchée par un autre ;
// - il n'est pas déjà déposé (0081) ;
// - à l'instant du dépôt, elle dit toujours oui à l'agent et n'a pas écarté ce brouillon : c'est son oui qui autorise
//   Leon à écrire dans sa boîte, et un passage dure plusieurs minutes après l'avoir lu (brouillons.ts) ;
// - chez Gmail, au même instant, le fil attend toujours sa réponse (client.ts, replyHeaders) : Leon ne relève sa boîte
//   que quelques fois par jour, et un brouillon déposé dans un fil auquel elle a déjà répondu y resterait.
// shortcut: Gmail seulement, un brouillon sur un fil Outlook reste dans Leon ; à déposer par Microsoft Graph quand
// l'agent doit servir les boîtes Outlook.
//
// Deux requêtes par le proxy de Pipedream, donc deux crédits par brouillon déposé : la lecture du fil (s'il attend
// toujours, et les en-têtes du message reçu), puis la création du brouillon. Hors de toute transaction. Le destinataire
// est fixé ici, jamais par le modèle : l'auteur du mail reçu, à qui elle a déjà écrit (waiting-mails.ts).
// shortcut: Reply-To est ignoré et personne n'est mis en copie ; à revoir si de vraies boîtes montrent des réponses
// qui partent à la mauvaise adresse.
//
// Un dépôt qui échoue (Pipedream non configuré ou injoignable, accès refusé, fil supprimé entre-temps, réponse
// inattendue) ne lève pas : le brouillon reste dans Leon, non déposé, l'échec est journalisé sans rien de capté, et
// l'état de la connexion n'est pas touché.
// shortcut: une seule tentative, à l'écriture du brouillon, pour ne pas payer une requête à chaque passage ; un dépôt
// manqué ne se rattrape pas, à retenter (une fois, plus tard) si les journaux en montrent souvent.

// `to` : l'adresse de l'auteur du mail reçu. Rend true quand le brouillon est déposé.
export async function depositBrouillon(
  ctx: TenantContext,
  draft: { id: string; to: string },
  deps: { fetchImpl?: typeof fetch } = {}, // tests
): Promise<boolean> {
  try {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select({
          message: brouillons.message,
          texte: brouillons.texte,
          kind: sources.kind,
          thread: sources.externalId,
          connectionId: sources.connectionId,
        })
        .from(brouillons)
        .innerJoin(
          sources,
          and(eq(sources.tenantId, brouillons.tenantId), eq(sources.id, brouillons.sourceId)),
        )
        .innerJoin(
          reponsesAgent,
          and(
            eq(reponsesAgent.tenantId, brouillons.tenantId),
            eq(reponsesAgent.userId, brouillons.userId),
            eq(reponsesAgent.agent, EN_SERVICE),
            eq(reponsesAgent.oui, true),
          ),
        )
        .where(
          and(
            eq(brouillons.tenantId, ctx.tenantId),
            eq(brouillons.userId, ctx.userId),
            eq(brouillons.id, draft.id),
            isNotNull(brouillons.texte),
            isNull(brouillons.brouillonGmail),
            isNull(brouillons.ecarteLe),
          ),
        ),
    );
    if (!row?.texte || hasBlank(row.texte) || row.kind !== 'gmail') return false;
    const messageId = /^message:(.+)$/.exec(row.message)?.[1];
    const threadId = /^thread:(.+)$/.exec(row.thread)?.[1];
    if (!messageId || !threadId) return false;
    const connection = (await loadMyConnections(ctx, 'gmail')).find(
      (one) => one.id === row.connectionId,
    );
    const config = gmailConnector.configSchema.safeParse(connection?.config);
    if (!config.success) return false;

    const client = gmailClient(connectorHttp('gmail', gmailConnector, config.data, deps));
    const headers = await client.replyHeaders(threadId, messageId);
    // Depuis la relève, elle a répondu ou supprimé le mail, ou on lui a récrit : rien à déposer, et ce n'est pas un échec.
    if (!headers) return false;
    const raw = replyRaw({ ...headers, to: draft.to, text: row.texte });
    // Un message reçu sans identifiant, ou une adresse qui n'en est pas une : pas de réponse dans le fil.
    if (raw === null) throw new ConnectorHttpError(null, 'Unexpected response');
    const brouillonGmail = await client.createDraft(threadId, raw);
    await withTenant(ctx, (tx) =>
      tx
        .update(brouillons)
        .set({ brouillonGmail })
        .where(
          and(
            eq(brouillons.tenantId, ctx.tenantId),
            eq(brouillons.userId, ctx.userId),
            eq(brouillons.id, draft.id),
          ),
        ),
    );
    return true;
  } catch (error) {
    // Des identifiants seulement : les erreurs du client HTTP portent un message fixe, jamais une réponse de Gmail.
    logError('brouillons.deposit_failed', error, { userId: ctx.userId, brouillonId: draft.id });
    return false;
  }
}
