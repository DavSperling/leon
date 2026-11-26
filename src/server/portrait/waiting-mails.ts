import { sql } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { epochToDate, LAST_TS_SQL, textArray } from '@/server/search/filters-sql';
import {
  MAIL_KINDS,
  MESSAGE,
  notOwn,
  ownAddresses,
  PART,
  SENT_MAIL_DAYS,
  sentTurns,
  TEAM,
} from './sent-mails';

// Les mails qui attendent la réponse d'une personne, trouvés sans modèle : ce que l'agent « Brouillons de réponse »
// (brouillons.ts) donne ensuite au modèle, un mail par appel. Lus sous withTenant de la personne, et seulement dans
// SES fils de courrier (owner_user_id), comme ses mails envoyés (sent-mails.ts) : ni le fil d'un collègue, ni la boîte
// qu'il partage à l'équipe.
//
// Un mail attend quand il est le dernier message de son fil et qu'il :
// - n'est pas d'elle : ni du côté de l'équipe, ni écrit d'une de ses adresses (d'un mail qu'elle s'envoie, Outlook
//   garde une copie reçue, sans côté) ;
// - date de moins de WAITING_DAYS jours ;
// - lui est adressé directement : une de ses adresses est en « à », pas seulement en copie. Ses adresses sont celles
//   d'où partent ses mails envoyés des 90 derniers jours (sentTurns) ;
// - n'est pas un envoi automatique ou en nombre (lettre d'information, notification) : la relève de Gmail le marque
//   « pas automatique » (0085), et son auteur peut alors être un inconnu, le modèle jugeant ensuite si une réponse est
//   attendue (décision de David, 26/11/2026 : plus de « Voulez-vous une réponse ? » avant de lire). Quand la relève ne
//   le dit pas (un tour d'Outlook, ou relevé avant 0085), il doit venir de quelqu'un à qui elle a écrit dans ces mêmes
//   mails envoyés, en « à » ou en copie : c'est alors ce qui écarte les lettres d'information et la prospection ;
// - n'a pas déjà été traité : ni brouillon écrit, ni questions posées à la personne, ni mail jugé sans réponse à donner
//   (0080, 0082).
// shortcut: ses envois automatiques (facts.ts, handWritten) comptent ici comme des mails envoyés, le tri se faisant en
// SQL sans lire leur texte : l'adresse qui reçoit ses notifications passe pour un correspondant, à écarter ici si de
// vraies boîtes le montrent.
// shortcut: les mails d'inconnus n'attendent qu'avec Gmail, la relève d'Outlook ne disant pas s'ils sont automatiques ;
// à lire dans Outlook (ses en-têtes) si une boîte Outlook en a besoin.

export const WAITING_DAYS = 7;
// Passé cet âge du mail, Leon n'attend plus ses réponses : ni question posée à l'accueil, ni second appel.
export const ANSWERED_DAYS = 30;
// Les plus récents d'abord, par passage (un appel au modèle chacun).
export const WAITING_MAX = 5;
// Ce que le modèle reçoit du fil : ses derniers messages, chacun coupé.
const THREAD_MESSAGES = 4;
const MESSAGE_CHARS = 1500;
const DAY_MS = 24 * 60 * 60 * 1000;

type ThreadMessage = {
  // Son nom, à défaut son adresse.
  author: string | null;
  // Un message d'elle.
  own: boolean;
  at: Date;
  text: string;
};

export type WaitingMail = {
  sourceId: string;
  // Le message auquel répondre : l'identifiant de ses tours, « message:<id> », sans le rang ni l'empreinte.
  message: string;
  // L'adresse de qui l'a écrit, en minuscules.
  from: string;
  subject: string | null;
  // Les THREAD_MESSAGES derniers messages du fil, du plus ancien au plus récent : le dernier est celui auquel répondre.
  messages: ThreadMessage[];
};

// Un mail pour lequel elle a répondu à Leon, et dont le brouillon reste à écrire : à ses questions (le second appel),
// ou « Oui » au mail d'un inconnu ou à une relance (le premier appel). Pour une relance, `from` est le premier
// destinataire en « à » de son mail qui n'est pas elle : celui à qui elle écrit.
export type AnsweredMail = WaitingMail & {
  // La ligne du brouillon (0082, 0084), et sa sorte (0089).
  id: string;
  sorte: 'reponse' | 'relance';
  // Ses questions et ses réponses, une par question, dans le même ordre ; une réponse peut être vide. Nulles pour son
  // oui à un inconnu, tant que le premier appel n'a pas posé de questions.
  questions: string[] | null;
  reponses: string[] | null;
  // Ses indications au mail d'un inconnu, vides quand elle n'en a pas donné (0084). Nulles pour un autre mail.
  indications: string | null;
};

type MessageRow = {
  sourceId: string;
  message: string;
  author: string | null;
  own: boolean;
  at: string;
  text: string;
};

// Ces mails avec les derniers messages de leur fil, un mail coupé recollé dans l'ordre de ses morceaux (comme
// readSentMails).
async function withMessages<M extends { sourceId: string; message: string }>(
  tx: Tx,
  ctx: TenantContext,
  mails: M[],
): Promise<Array<M & { messages: ThreadMessage[] }>> {
  if (mails.length === 0) return [];
  const { rows } = await tx.execute<MessageRow>(sql`
    select "sourceId", message, author, own, at, text from (
      select m.source_id as "sourceId", m.message,
             coalesce(min(m.author_name), min(m.author_email)) as author,
             coalesce(bool_or(m.author_side = ${TEAM}), false) as own,
             extract(epoch from min(m.ts)) as at,
             left(string_agg(m.text, ${'\n'} order by m.part), ${MESSAGE_CHARS}) as text,
             row_number() over (partition by m.source_id order by min(m.ts) desc, m.message desc) as n
      from (
        select t.source_id, t.author_name, t.author_email, t.author_side, t.ts, t.text,
               substring(t.external_id from ${MESSAGE}) as message,
               coalesce(substring(t.external_id from ${PART})::int, 0) as part
        from turns t
        where t.tenant_id = ${ctx.tenantId}
          and t.source_id = any(${textArray(mails.map((mail) => mail.sourceId))}::uuid[])
          and t.external_id like 'message:%'
      ) m
      group by m.source_id, m.message
    ) recent
    where n <= ${THREAD_MESSAGES}
    order by "sourceId", n desc`);
  return mails.flatMap((mail) => {
    const messages = rows.filter((row) => row.sourceId === mail.sourceId);
    // Un message arrivé entre les deux lectures : ce mail n'est plus le dernier du fil, rien à préparer.
    if (messages.at(-1)?.message !== mail.message) return [];
    return [
      {
        ...mail,
        messages: messages.map(({ author, own, at, text }) => ({
          author,
          own,
          at: epochToDate(at),
          text,
        })),
      },
    ];
  });
}

// Elle a écrit à l'auteur du mail, en « à » ou en copie, dans ses mails envoyés : un correspondant. Ses destinataires
// se lisent une fois par requête, pas une fois par fil ; sans nul, pour une adresse jamais nulle, la condition est vraie
// ou fausse, jamais nulle.
const CORRESPONDENT = sql`(l.address = any(array(select r from sent, unnest(sent.recipients) r where r is not null)))`;

// Sous les alias `s` (le fil) et `l` (son dernier tour), avec `sent`, ses mails envoyés. `l` : un mail coupé en
// plusieurs tours les date tous pareil, n'importe lequel donne son message, son auteur, ses destinataires et le fait de
// la relève. Deux messages à la même date : le plus grand identifiant, ici, dans la lecture du fil plus bas et à
// l'écran (readShown, brouillons.ts). Une adresse d'auteur est exigée : c'est à elle que la réponse irait.
// `resting` : les mails que le passage laisse de côté (brouillons.ts, restingMails), « <fil>|<message> » : écartés ici,
// avant la limite, pour qu'ils ne prennent pas la place des autres.
export async function readWaitingMails(
  ctx: TenantContext,
  now = new Date(),
  resting: string[] = [],
): Promise<WaitingMail[]> {
  const since = new Date(now.getTime() - WAITING_DAYS * DAY_MS).toISOString();
  const sentSince = new Date(now.getTime() - SENT_MAIL_DAYS * DAY_MS);
  return withTenant(ctx, async (tx) => {
    const { rows: mails } = await tx.execute<Omit<WaitingMail, 'messages'>>(sql`
      with sent as (
        select lower(t.author_email) as address, t.recipients_to || t.recipients_cc as recipients
        from turns t
        join sources s on s.tenant_id = t.tenant_id and s.id = t.source_id
        where ${sentTurns(ctx, sentSince)}
      )
      select s.id as "sourceId", l.message, l.address as "from", s.title as subject
      from sources s
      cross join lateral (select ${LAST_TS_SQL} as last_ts) a
      cross join lateral (
        select substring(t.external_id from ${MESSAGE}) as message, lower(t.author_email) as address,
               t.author_side, t.recipients_to, t.automated, t.ts
        from turns t
        where t.tenant_id = s.tenant_id and t.source_id = s.id
        order by t.ts desc, substring(t.external_id from ${MESSAGE}) desc
        limit 1
      ) l
      where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId}
        and s.kind = any(${textArray(MAIL_KINDS)}) and s.metadata->>'nature' = 'fil'
        and a.last_ts >= ${since}::timestamptz and l.ts >= ${since}::timestamptz
        and l.message is not null and l.address is not null
        and l.author_side is distinct from ${TEAM}
        and l.address not in (select address from sent where address is not null)
        and l.recipients_to && array(select address from sent where address is not null)
        and (l.automated is false or (l.automated is null and ${CORRESPONDENT}))
        and not exists (
          select 1 from brouillons b
          where b.tenant_id = s.tenant_id and b.source_id = s.id
            and b.user_id = ${ctx.userId} and b.message = l.message)
        and s.id::text || '|' || l.message <> all(${textArray(resting)}::text[])
      order by l.ts desc, s.id
      limit ${WAITING_MAX}`);
    return withMessages(tx, ctx, mails);
  });
}

// Les brouillons qu'elle attend, et dont le texte reste à écrire (brouillons.ts) : Leon lui avait posé ses questions,
// et elle y a répondu (le second appel) ; ou elle a dit « Oui » au mail d'un inconnu (0084), et le modèle ne l'a pas
// encore lu (le premier appel). Ceux qu'elle n'a pas écartés, et dont le fil n'a pas bougé depuis : le mail est
// toujours son dernier message. Les règles d'un mail qui attend ne se rejouent pas : il les passait quand Leon a posé
// ses questions, ou quand elle a dit oui, et un passage peut venir plus de WAITING_DAYS jours après. Mais pas plus de
// ANSWERED_DAYS jours après le mail : un appel resté illisible se retente à chaque passage, et c'est ce qui l'arrête.
// Seulement les lignes des `sortes` dont elle veut l'agent (brouillons.ts).
export async function readAnsweredMails(
  ctx: TenantContext,
  sortes: Array<AnsweredMail['sorte']>,
  resting: string[] = [],
): Promise<AnsweredMail[]> {
  const own = ownAddresses(ctx, new Date(Date.now() - SENT_MAIL_DAYS * DAY_MS));
  return withTenant(ctx, async (tx) => {
    const { rows: mails } = await tx.execute<Omit<AnsweredMail, 'messages'>>(sql`
      select b.id, b.sorte, b.source_id as "sourceId", b.message, s.title as subject,
             case when b.sorte = 'relance' then (${notOwn(sql`l.recipients_to`, own)})[1]
                  else l.address end as "from",
             b.questions, b.reponses, b.indications
      from brouillons b
      join sources s on s.tenant_id = b.tenant_id and s.id = b.source_id
      cross join lateral (
        select substring(t.external_id from ${MESSAGE}) as message, lower(t.author_email) as address,
               t.recipients_to, t.ts
        from turns t
        where t.tenant_id = b.tenant_id and t.source_id = b.source_id
        order by t.ts desc, substring(t.external_id from ${MESSAGE}) desc
        limit 1
      ) l
      where b.tenant_id = ${ctx.tenantId} and b.user_id = ${ctx.userId}
        and b.sorte = any(${textArray(sortes)}) and b.texte is null and b.ecarte_le is null
        and (b.reponses is not null or (b.indications is not null and b.questions is null))
        and l.message = b.message and l.ts >= now() - make_interval(days => ${ANSWERED_DAYS})
        and b.source_id::text || '|' || b.message <> all(${textArray(resting)}::text[])
      order by l.ts desc, b.id
      limit ${WAITING_MAX}`);
    return withMessages(tx, ctx, mails);
  });
}
