import { sql } from 'drizzle-orm';
import type { AuthorSide, SourceKind } from '@/capture/turn';
import { listMembers } from '@/server/auth/members';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';
import { epochToDate, textArray } from '@/server/search/filters-sql';
import { companyDomains, type SentMail } from './facts';

// Les mails envoyés d'une personne, dans la forme que lit computeFacts (facts.ts). Lus sous withTenant de la personne,
// et seulement dans SES sources (owner_user_id), comme le calendrier de l'Accueil (agenda.ts) : la boîte qu'un collègue
// partage à l'équipe n'entre pas dans sa fiche.
//
// Un mail envoyé est un tour du côté de l'équipe (libellé SENT de Gmail, éléments envoyés d'Outlook) dans un fil de
// courrier. La normalisation coupe un long mail en plusieurs tours (`message:<id>:1#…`, `message:<id>:2#…`, même date,
// mêmes destinataires) : ils se regroupent ici en un message, texte recollé dans l'ordre.
// shortcut: un mail relu après un changement de la normalisation garde ses deux versions (deux empreintes), recollées ici
// en un seul texte ; ne lire que la dernière si cela arrive, comme les réunions d'agenda.ts.

const SENT_MAIL_DAYS = 90;
// Les plus récents au-delà : à 30 mails par jour ouvré, 90 jours en font 2 000.
const SENT_MAILS_MAX = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const MAIL_KINDS = ['gmail', 'outlook'] satisfies SourceKind[];
const TEAM = 'team' satisfies AuthorSide;
// L'identifiant d'un tour de courrier (gmail/map.ts, outlook/map.ts, puis normalize.ts) : le message, et le rang du
// morceau quand le mail a été coupé. L'identifiant d'un message ne contient ni « : » ni « # ».
const MESSAGE = '^message:[^:#]+';
const PART = '^message:[^:#]+:([0-9]+)#';

type Row = {
  sourceId: string;
  sent: string;
  to: string[];
  cc: string[];
  text: string;
  received: string | null;
};

// `sourceId` : le fil du mail. `domains` : les domaines de la société, d'après les adresses de ses membres.
export async function readSentMails(
  ctx: TenantContext,
  days = SENT_MAIL_DAYS,
  now = new Date(),
): Promise<{ mails: Array<SentMail & { sourceId: string }>; domains: string[] }> {
  const since = new Date(now.getTime() - days * DAY_MS);
  // `received` : la date du tour qui précède dans le fil, s'il n'est pas de la personne. Une relance après son propre
  // mail ne répond à rien.
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<Row>(sql`
      select m.source_id as "sourceId", extract(epoch from m.ts) as sent,
             m.recipients_to as "to", m.recipients_cc as cc, m.text,
             (select case when p.author_side is distinct from ${TEAM} then extract(epoch from p.ts) end
              from turns p
              where p.tenant_id = m.tenant_id and p.source_id = m.source_id and p.ts < m.ts
              order by p.ts desc limit 1) as received
      from (
        select t.tenant_id, t.source_id, min(t.ts) as ts,
               min(t.recipients_to) as recipients_to, min(t.recipients_cc) as recipients_cc,
               string_agg(t.text, ${'\n'} order by coalesce(substring(t.external_id from ${PART})::int, 0)) as text
        from turns t
        join sources s on s.tenant_id = t.tenant_id and s.id = t.source_id
        where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId}
          and s.kind = any(${textArray(MAIL_KINDS)})
          and t.author_side = ${TEAM} and t.external_id like 'message:%'
          and t.ts >= ${since.toISOString()}::timestamptz
        group by t.tenant_id, t.source_id, substring(t.external_id from ${MESSAGE})
        order by min(t.ts) desc
        limit ${SENT_MAILS_MAX}
      ) m
      order by m.ts`),
  );
  const members = await listMembers(ctx);
  return {
    mails: rows.map((row) => ({
      sourceId: row.sourceId,
      sentAt: epochToDate(row.sent),
      to: row.to,
      cc: row.cc,
      text: row.text,
      repliesToAt: row.received === null ? null : epochToDate(row.received),
    })),
    domains: companyDomains(members.map((member) => member.email)),
  };
}
