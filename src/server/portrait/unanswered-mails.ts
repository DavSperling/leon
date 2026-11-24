import { type SQL, sql } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { MACHINE_SENDER } from '@/server/connectors/gmail/map';
import { withTenant } from '@/server/db/with-tenant';
import { epochToDate, LAST_TS_SQL, textArray } from '@/server/search/filters-sql';
import { ownText } from './own-text';
import { wordsOf } from './retouche';
import {
  MAIL_KINDS,
  MESSAGE,
  notOwn,
  ownAddresses,
  PART,
  SENT_MAIL_DAYS,
  TEAM,
} from './sent-mails';
import { ANSWERED_DAYS } from './waiting-mails';

// Ses mails restés sans réponse, trouvés sans modèle : ceux que l'agent « Relances » lui propose de relancer. L'accueil
// lui demande d'abord, pour chacun, si elle veut une relance (brouillons.ts, answerRelance) : aucun modèle ne lit ce
// mail avant son oui. Lus sous withTenant de la personne, et seulement dans SES fils de courrier (owner_user_id), comme
// les mails qui attendent sa réponse (waiting-mails.ts) : ni le fil d'un collègue, ni la boîte qu'il partage à l'équipe.
//
// Un mail est sans réponse quand il est le dernier message de son fil (départagé comme dans waiting-mails.ts) et qu'il :
// - est d'elle : du côté de l'équipe ;
// - date d'au moins UNANSWERED_DAYS jours, samedis et dimanches compris, et d'au plus ANSWERED_DAYS jours ;
// - a en « à » au moins un destinataire qui n'est pas une de ses adresses (un mail qu'elle s'envoie ne se relance
//   pas), collègues compris. Ses adresses sont celles d'où partent ses mails envoyés des 90 derniers jours ;
// - a au plus RECIPIENTS_MAX destinataires, « à » et copie : au-delà, c'est une annonce ;
// - n'a aucun destinataire qui soit une adresse de machine (MACHINE_SENDER, connectors/gmail/map.ts) ;
// - n'a pas déjà été traité : aucune ligne dans brouillons pour ce message (son oui ou son non, 0088) ;
// - n'est pas un simple accusé ou remerciement (asksForReply).
// shortcut: un mail Outlook où elle se met en copie laisse après le sien une copie reçue, sans côté : il ne se propose
// pas ; à reconnaître par son adresse d'auteur si de vraies boîtes le montrent.

const UNANSWERED_DAYS = 5;
const RECIPIENTS_MAX = 10;
// Les plus récents lus en SQL, avant le filtre du texte, et ce qu'il lit de chacun.
const CANDIDATES = 100;
const TEXT_CHARS = 4000;
const WORDS_MIN = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

// shortcut: un mail attend une réponse quand ce qu'elle y a écrit (own-text.ts : ni citation, ni signature) a au moins
// WORDS_MIN mots ou une question ; un accusé ou un remerciement n'en a pas. Le tri se fait ici, sur les CANDIDATES plus
// récents : à régler sur de vraies boîtes (des mots, des tournures, une limite plus haute).
const asksForReply = (mail: string) => {
  const { text } = ownText(mail);
  return text.includes('?') || wordsOf(text).length >= WORDS_MIN;
};

// Le nom à montrer pour son mail : celui du premier destinataire en « à » qui n'est pas elle (`first`, son adresse),
// pris dans un message du fil `source` qu'il a écrit, à défaut son adresse. L'accueil le montre aussi pour une relance
// (brouillons.ts, readShown).
export const recipientName = (ctx: TenantContext, source: SQL, first: SQL): SQL =>
  sql`coalesce((select t.author_name from turns t
    where t.tenant_id = ${ctx.tenantId} and t.source_id = ${source}
      and lower(t.author_email) = ${first} and t.author_name is not null
    order by t.ts desc limit 1), ${first})`;

// Ses mails sans réponse (plus haut), dans une requête qui rend `columns`, sous les alias `s` (le fil), `l` (son dernier
// tour) et `d.recipients` (ses destinataires en « à » qui ne sont pas elle) : tous, ou ce seul mail (`only`, son fil et
// son message). L'accueil les lit (readUnansweredMails), et sa réponse s'écrit d'après eux (brouillons.ts,
// answerRelance). Le texte n'y entre pas.
export function unansweredMails(
  ctx: TenantContext,
  now: Date,
  columns: SQL,
  only?: { sourceId: string; message: string },
): SQL {
  const since = new Date(now.getTime() - ANSWERED_DAYS * DAY_MS).toISOString();
  const until = new Date(now.getTime() - UNANSWERED_DAYS * DAY_MS).toISOString();
  const sentSince = new Date(now.getTime() - SENT_MAIL_DAYS * DAY_MS);
  return sql`
    with own as (select ${ownAddresses(ctx, sentSince)} as addresses)
    select ${columns}
    from sources s
    cross join own
    cross join lateral (select ${LAST_TS_SQL} as last_ts) a
    cross join lateral (
      select substring(t.external_id from ${MESSAGE}) as message, t.author_side, t.recipients_to,
             t.recipients_cc, t.ts
      from turns t
      where t.tenant_id = s.tenant_id and t.source_id = s.id
      order by t.ts desc, substring(t.external_id from ${MESSAGE}) desc
      limit 1
    ) l
    cross join lateral (select ${notOwn(sql`l.recipients_to`, sql`own.addresses`)} as recipients) d
    where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId}
      and s.kind = any(${textArray(MAIL_KINDS)}) and s.metadata->>'nature' = 'fil'
      and a.last_ts >= ${since}::timestamptz
      and l.ts >= ${since}::timestamptz and l.ts <= ${until}::timestamptz
      and l.message is not null and l.author_side = ${TEAM}
      and cardinality(d.recipients) > 0
      and cardinality(l.recipients_to) + cardinality(l.recipients_cc) <= ${RECIPIENTS_MAX}
      and not exists (
        select 1 from unnest(l.recipients_to || l.recipients_cc) r where r ~* ${MACHINE_SENDER.source})
      and not exists (
        select 1 from brouillons b
        where b.tenant_id = s.tenant_id and b.source_id = s.id
          and b.user_id = ${ctx.userId} and b.message = l.message)
      ${only ? sql`and s.id = ${only.sourceId} and l.message = ${only.message}` : sql``}`;
}

// Son mail sans réponse, tel que l'accueil le montre : `to`, le nom à montrer (recipientName) ; `others`, ses autres
// destinataires en « à » qui ne sont pas elle ; `sentAt`, la date de son mail. `message` sert, avec le fil, à lui
// répondre. Rien de son texte, ni d'adresse que le nom.
export type UnansweredMail = {
  sourceId: string;
  message: string;
  to: string;
  others: number;
  sentAt: Date;
};

// Ses `max` mails sans réponse, les plus récents d'abord. Leur texte ne sert qu'au filtre (asksForReply), et ne sort pas
// d'ici.
export async function readUnansweredMails(
  ctx: TenantContext,
  max: number,
  now = new Date(),
): Promise<UnansweredMail[]> {
  const columns = sql`s.id as "sourceId", l.message,
    ${recipientName(ctx, sql`s.id`, sql`d.recipients[1]`)} as "to",
    cardinality(d.recipients) - 1 as others, extract(epoch from l.ts) as at,
    left((select string_agg(t.text, ${'\n'} order by coalesce(substring(t.external_id from ${PART})::int, 0))
          from turns t
          where t.tenant_id = s.tenant_id and t.source_id = s.id
            and substring(t.external_id from ${MESSAGE}) = l.message), ${TEXT_CHARS}) as text`;
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<Omit<UnansweredMail, 'sentAt'> & { at: string; text: string }>(sql`
      ${unansweredMails(ctx, now, columns)}
      order by l.ts desc, s.id
      limit ${CANDIDATES}`),
  );
  return rows
    .filter((row) => asksForReply(row.text))
    .slice(0, max)
    .map(({ sourceId, message, to, others, at }) => ({
      sourceId,
      message,
      to,
      others,
      sentAt: epochToDate(at),
    }));
}
