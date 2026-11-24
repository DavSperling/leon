import { and, eq, sql } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { loadMyConnections } from '@/server/connectors/connections';
import { gmailClient } from '@/server/connectors/gmail/client';
import { gmailConnector } from '@/server/connectors/gmail/connector';
import { replyRaw } from '@/server/connectors/gmail/reply';
import { ConnectorHttpError } from '@/server/connectors/http';
import { connectorHttp } from '@/server/connectors/pipedream';
import { sources } from '@/server/db/schema/memory';
import { brouillons } from '@/server/db/schema/portrait';
import { withTenant } from '@/server/db/with-tenant';
import { logError } from '@/server/log';
import { hasBlank } from './brouillon-prompt';
import { MESSAGE, ownAddresses, SENT_MAIL_DAYS } from './sent-mails';
import { relanceRecipients } from './unanswered-mails';

// Le dépôt d'un brouillon dans les brouillons Gmail de la personne, en réponse dans le fil, juste après qu'un passage
// l'a écrit (brouillons.ts) : la réponse à un mail reçu (« Brouillons de réponse ») comme la relance de son mail resté
// sans réponse (« Relances », 0089). Puis son retrait : quand elle l'écarte dans Leon (withdrawBrouillon). Ce sont les
// seules écritures de Leon dans une boîte : un brouillon de plus, puis ce même brouillon de moins, ou ce brouillon
// envoyé quand elle clique « Envoyer » et le confirme (sendBrouillon). Rien d'autre n'y est envoyé, supprimé ni modifié.
//
// Un brouillon est déposé si, et seulement si :
// - il est complet : son texte ne porte aucun blanc entre crochets (hasBlank). Un brouillon incomplet reste dans Leon
//   seulement, d'où il ne peut pas partir par erreur ;
// - son fil est un fil Gmail relevé par une connexion Gmail qu'elle a branchée elle-même, par Pipedream, et qui n'est
//   pas en pause (loadMyConnections) : ni le fil d'un collègue, ni une boîte branchée par un autre ;
// - il n'est pas déjà déposé (0081) ;
// - à l'instant du dépôt, elle dit toujours oui à l'agent de sa sorte, « Brouillons de réponse » pour une réponse,
//   « Relances » pour une relance (un oui à l'un ne dépose jamais la sorte de l'autre), et n'a pas écarté ce
//   brouillon : c'est son oui qui autorise Leon à écrire dans sa boîte, et un passage dure plusieurs minutes après
//   l'avoir lu (brouillons.ts) ;
// - il a au moins un destinataire en « à » (plus bas) ;
// - chez Gmail, au même instant, personne n'a écrit dans le fil après le message auquel il répond (client.ts,
//   replyHeaders) : le mail reçu attend toujours sa réponse, ou son mail relancé est toujours sans réponse. Leon ne
//   relève sa boîte que quelques fois par jour, et un brouillon déposé dans un fil qui a bougé y resterait.
// shortcut: Gmail seulement, un brouillon sur un fil Outlook reste dans Leon ; à déposer par Microsoft Graph quand
// l'agent doit servir les boîtes Outlook.
//
// Deux requêtes par le proxy de Pipedream, donc deux crédits par brouillon déposé : la lecture du fil (s'il attend
// toujours, et les en-têtes du message auquel répondre), puis la création du brouillon. Hors de toute transaction. Les
// destinataires sont fixés ici, d'après le mail, jamais par le modèle ni par l'appelant :
// - une réponse va à l'auteur du mail reçu, à qui elle a déjà écrit, ou l'inconnu dont elle a voulu une réponse
//   (waiting-mails.ts), sans copie ;
// - une relance va aux destinataires de son mail relancé (unanswered-mails.ts, relanceRecipients) : en « à », ceux
//   qu'il avait en « à », sans ses adresses à elle ; en copie, ceux qu'il avait en copie, sans elle ni ceux déjà en
//   « à ». Sans copie cachée, que Leon ne connaît pas. Personne en « à » : rien n'est déposé, et ce n'est pas un échec.
// shortcut: Reply-To est ignoré, et une réponse ne met personne en copie ; à revoir si de vraies boîtes montrent des
// réponses qui partent à la mauvaise adresse.
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

const DAY_MS = 24 * 60 * 60 * 1000;

// Rend true quand le brouillon `id` est déposé.
export async function depositBrouillon(
  ctx: TenantContext,
  id: string,
  deps: Deps = {},
): Promise<boolean> {
  try {
    const own = ownAddresses(ctx, new Date(Date.now() - SENT_MAIL_DAYS * DAY_MS));
    const relance = relanceRecipients(sql`m.recipients_to`, sql`m.recipients_cc`, sql`o.addresses`);
    const { rows } = await withTenant(ctx, (tx) =>
      tx.execute<{
        message: string;
        texte: string;
        kind: string;
        thread: string;
        connectionId: string | null;
        to: string[];
        cc: string[];
      }>(sql`
        select b.message, b.texte, s.kind, s.external_id as thread, s.connection_id as "connectionId",
               case when b.sorte = 'relance' then ${relance.to}
                    else array[lower(m.author_email)] end as "to",
               case when b.sorte = 'relance' then ${relance.cc} else '{}'::text[] end as cc
        from brouillons b
        join sources s on s.tenant_id = b.tenant_id and s.id = b.source_id
        join reponses_agent r on r.tenant_id = b.tenant_id and r.user_id = b.user_id and r.oui
          and r.agent = case when b.sorte = 'relance' then 'relance' else 'brouillon-reponse' end
        -- Un seul tour de son message : un mail coupé a le même auteur et les mêmes destinataires sur chacun.
        cross join lateral (
          select t.author_email, t.recipients_to, t.recipients_cc
          from turns t
          where t.tenant_id = b.tenant_id and t.source_id = b.source_id
            and substring(t.external_id from ${MESSAGE}) = b.message
          limit 1
        ) m
        cross join (select ${own} as addresses) o
        where b.tenant_id = ${ctx.tenantId} and b.user_id = ${ctx.userId} and b.id = ${id}
          and b.texte is not null and b.brouillon_gmail is null and b.ecarte_le is null`),
    );
    const [row] = rows;
    if (!row?.texte || hasBlank(row.texte) || row.kind !== 'gmail') return false;
    // Une relance dont aucun destinataire en « à » n'est quelqu'un d'autre qu'elle : rien à déposer.
    if (row.to.length === 0) return false;
    const messageId = /^message:(.+)$/.exec(row.message)?.[1];
    const threadId = /^thread:(.+)$/.exec(row.thread)?.[1];
    if (!messageId || !threadId) return false;
    const client = await gmailOf(ctx, row.connectionId, deps);
    if (!client) return false;
    const headers = await client.replyHeaders(threadId, messageId);
    // Depuis la relève, le fil a bougé (une réponse, un autre mail) ou le message n'y est plus : rien à déposer, et ce
    // n'est pas un échec.
    if (!headers) return false;
    const raw = replyRaw({ ...headers, to: row.to, cc: row.cc, text: row.texte });
    // Un message sans identifiant, ou une adresse qui n'en est pas une : pas de réponse dans le fil.
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
            eq(brouillons.id, id),
          ),
        ),
    );
    // Elle a pu l'écarter pendant le dépôt (deux requêtes, quelques secondes) : son « Écarter » n'avait alors rien vu
    // à retirer. Un brouillon écarté ne reste pas dans sa boîte : il en repart aussitôt. Sans cela, rien à retirer.
    return !(await withdrawBrouillon(ctx, id, deps));
  } catch (error) {
    // Des identifiants seulement : les erreurs du client HTTP portent un message fixe, jamais une réponse de Gmail.
    logError('brouillons.deposit_failed', error, { userId: ctx.userId, brouillonId: id });
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
// L'envoi posé (envoye_le, 0088), la ligne quitte l'accueil aussitôt.
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
          envoyeLe: brouillons.envoyeLe,
          connectionId: sources.connectionId,
        })
        .from(brouillons)
        .innerJoin(
          sources,
          and(eq(sources.tenantId, brouillons.tenantId), eq(sources.id, brouillons.sourceId)),
        )
        .where(mine),
    );
    if (!row || row.ecarteLe || row.envoyeLe || row.brouillonGmail === null) return 'introuvable';
    const client = await gmailOf(ctx, row.connectionId, deps);
    if (!client) return 'echec';
    await client.sendDraft(row.brouillonGmail);
    await withTenant(ctx, (tx) =>
      tx.update(brouillons).set({ brouillonGmail: null, envoyeLe: sql`now()` }).where(mine),
    );
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
