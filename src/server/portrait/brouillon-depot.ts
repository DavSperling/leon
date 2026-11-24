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
// l'a écrit (brouillons.ts), et son retrait quand elle l'écarte dans Leon (withdrawBrouillon). Ce sont les seules
// écritures de Leon dans une boîte : un brouillon de plus, puis ce même brouillon de moins, ou ce brouillon envoyé
// quand elle clique « Envoyer » et le confirme (sendBrouillon). Rien d'autre n'y est envoyé, supprimé ni modifié.
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
// est fixé ici, jamais par le modèle : l'auteur du mail reçu, à qui elle a déjà écrit, ou l'inconnu dont elle a
// voulu une réponse (waiting-mails.ts).
// shortcut: Reply-To est ignoré et personne n'est mis en copie ; à revoir si de vraies boîtes montrent des réponses
// qui partent à la mauvaise adresse.
//
// Un dépôt qui échoue (Pipedream non configuré ou injoignable, accès refusé, fil supprimé entre-temps, réponse
// inattendue) ne lève pas : le brouillon reste dans Leon, non déposé, l'échec est journalisé sans rien de capté, et
// l'état de la connexion n'est pas touché.
// shortcut: une seule tentative, à l'écriture du brouillon, pour ne pas payer une requête à chaque passage ; un dépôt
// manqué ne se rattrape pas, à retenter (une fois, plus tard) si les journaux en montrent souvent.

type Deps = { fetchImpl?: typeof fetch }; // tests

// Sa boîte Gmail, celle qui a relevé le fil : une connexion qu'elle a branchée elle-même, par Pipedream, et qui n'est
// pas en pause. Null sinon : ni la boîte d'un collègue, ni une autre de ses boîtes.
async function gmailOf(ctx: TenantContext, connectionId: string | null, deps: Deps) {
  const connection = (await loadMyConnections(ctx, 'gmail')).find((one) => one.id === connectionId);
  const config = gmailConnector.configSchema.safeParse(connection?.config);
  return config.success
    ? gmailClient(connectorHttp('gmail', gmailConnector, config.data, deps))
    : null;
}

// `to` : l'adresse de l'auteur du mail reçu. Rend true quand le brouillon est déposé.
export async function depositBrouillon(
  ctx: TenantContext,
  draft: { id: string; to: string },
  deps: Deps = {},
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
    const client = await gmailOf(ctx, row.connectionId, deps);
    if (!client) return false;
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
    // Elle a pu l'écarter pendant le dépôt (deux requêtes, quelques secondes) : son « Écarter » n'avait alors rien vu
    // à retirer. Un brouillon écarté ne reste pas dans sa boîte : il en repart aussitôt. Sans cela, rien à retirer.
    return !(await withdrawBrouillon(ctx, draft.id, deps));
  } catch (error) {
    // Des identifiants seulement : les erreurs du client HTTP portent un message fixe, jamais une réponse de Gmail.
    logError('brouillons.deposit_failed', error, { userId: ctx.userId, brouillonId: draft.id });
    return false;
  }
}

// Retire de Gmail le brouillon que Leon y a déposé, une fois qu'elle l'a écarté dans Leon (discardBrouillon) : un
// brouillon écarté ne doit plus pouvoir partir de sa boîte. La suppression est définitive, même si elle l'a retouché
// dans Gmail entre-temps. Seul un brouillon écarté, à elle, et déposé par Leon est supprimé : jamais un autre message.
// « Envoyer », depuis l'accueil, après sa confirmation : le brouillon déposé part de sa boîte Gmail, tel qu'il y est
// (elle a pu le retoucher dans Gmail). Seulement le sien, non écarté, déposé, et par la boîte qui l'a déposé
// (gmailOf). Le seul envoi de Leon : rien ne part sans ce geste. Envoyé, Leon oublie l'identifiant du brouillon Gmail :
// un second clic ne trouve plus rien à envoyer. Rend 'envoye', 'introuvable' (rien à envoyer d'ici : pas à elle,
// écarté, jamais déposé, déjà envoyé) ou 'echec' (sa boîte débranchée ou en pause, Gmail qui refuse, ou le brouillon
// qui n'y est plus), journalisé sans rien de capté.
// shortcut: la ligne reste « prête » sur l'accueil jusqu'à la prochaine relève de sa boîte (son envoi arrive alors dans
// le fil, qui n'attend plus), sans « Envoyer » ; une colonne « envoyé le » si cela se voit.
export async function sendBrouillon(
  ctx: TenantContext,
  id: string,
  deps: Deps = {},
): Promise<'envoye' | 'introuvable' | 'echec'> {
  const mine = and(
    eq(brouillons.tenantId, ctx.tenantId),
    eq(brouillons.userId, ctx.userId),
    eq(brouillons.id, id),
  );
  try {
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select({
          brouillonGmail: brouillons.brouillonGmail,
          ecarteLe: brouillons.ecarteLe,
          connectionId: sources.connectionId,
        })
        .from(brouillons)
        .innerJoin(
          sources,
          and(eq(sources.tenantId, brouillons.tenantId), eq(sources.id, brouillons.sourceId)),
        )
        .where(mine),
    );
    if (!row || row.ecarteLe || row.brouillonGmail === null) return 'introuvable';
    const client = await gmailOf(ctx, row.connectionId, deps);
    if (!client) return 'echec';
    await client.sendDraft(row.brouillonGmail);
    await withTenant(ctx, (tx) => tx.update(brouillons).set({ brouillonGmail: null }).where(mine));
    return 'envoye';
  } catch (error) {
    logError('brouillons.send_failed', error, { userId: ctx.userId, brouillonId: id });
    return 'echec';
  }
}

// Rend true quand il ne reste rien de Leon dans sa boîte pour ce brouillon (rien n'y était déposé, il vient d'être
// supprimé, ou il n'y était déjà plus). Rend false quand il y reste : sa boîte débranchée ou en pause, ou une
// suppression qui échoue, journalisée sans rien de capté. L'écran le lui dit alors.
// shortcut: une seule tentative, comme le dépôt ; un brouillon resté dans Gmail ne se retire plus d'ici.
export async function withdrawBrouillon(
  ctx: TenantContext,
  id: string,
  deps: Deps = {},
): Promise<boolean> {
  try {
    const mine = and(
      eq(brouillons.tenantId, ctx.tenantId),
      eq(brouillons.userId, ctx.userId),
      eq(brouillons.id, id),
    );
    const [row] = await withTenant(ctx, (tx) =>
      tx
        .select({
          brouillonGmail: brouillons.brouillonGmail,
          ecarteLe: brouillons.ecarteLe,
          connectionId: sources.connectionId,
        })
        .from(brouillons)
        .innerJoin(
          sources,
          and(eq(sources.tenantId, brouillons.tenantId), eq(sources.id, brouillons.sourceId)),
        )
        .where(mine),
    );
    if (!row?.ecarteLe) return false;
    if (row.brouillonGmail === null) return true;
    const client = await gmailOf(ctx, row.connectionId, deps);
    if (!client) return false;
    await client.deleteDraft(row.brouillonGmail);
    await withTenant(ctx, (tx) => tx.update(brouillons).set({ brouillonGmail: null }).where(mine));
    return true;
  } catch (error) {
    logError('brouillons.withdraw_failed', error, { userId: ctx.userId, brouillonId: id });
    return false;
  }
}
