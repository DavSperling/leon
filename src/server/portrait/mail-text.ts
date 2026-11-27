import { sql } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';
import { textArray } from '@/server/search/filters-sql';
import { MESSAGE, PART } from './sent-mails';

// Ce que « Voir le mail » montre sur l'accueil : le texte du dernier message de chaque fil, tel qu'il est gardé, un mail
// coupé en plusieurs tours recollé dans l'ordre de ses morceaux (comme withMessages, waiting-mails.ts). L'accueil en
// retire ensuite ce qui ne se lit pas (own-text.ts, shownText). Le mail reçu pour une réponse, son propre mail pour une
// relance : c'est le dernier du fil, sinon la ligne ne serait pas sur l'accueil. Lu sous ses droits (withTenant) : un
// fil qu'elle ne voit pas ne rend rien. Rien ne part au modèle : c'est elle qui lit. Coupé à MAIL_TEXT_CHARS, la fin
// n'est pas montrée (« Ouvrir dans Gmail » la donne).
export const MAIL_TEXT_CHARS = 20_000;

export async function readLastMessages(
  ctx: TenantContext,
  sourceIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(sourceIds)];
  if (ids.length === 0) return new Map();
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<{ sourceId: string; text: string }>(sql`
      select "sourceId", text from (
        select m.source_id as "sourceId",
               left(string_agg(m.text, ${'\n'} order by m.part), ${MAIL_TEXT_CHARS}) as text,
               row_number() over (partition by m.source_id order by min(m.ts) desc, m.message desc) as n
        from (
          select t.source_id, t.ts, t.text,
                 substring(t.external_id from ${MESSAGE}) as message,
                 coalesce(substring(t.external_id from ${PART})::int, 0) as part
          from turns t
          where t.tenant_id = ${ctx.tenantId}
            and t.source_id = any(${textArray(ids)}::uuid[])
            and t.external_id like 'message:%'
        ) m
        group by m.source_id, m.message
      ) last
      where n = 1`),
  );
  return new Map(rows.map((row) => [row.sourceId, row.text]));
}
