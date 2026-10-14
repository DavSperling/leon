import { sql } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';
import { cardUrl } from './card-url';
import { oneLine } from './labels';

export type SearchResult = {
  id: string;
  title: string;
  typeSlug: string;
  typeLabel: string;
  snippet: string;
  matchedFact: { id: string; statement: string } | null;
  updatedAt: Date;
  url: string;
};

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const SNIPPET_MAX = 160;

type Row = {
  id: string;
  title: string;
  type_slug: string;
  type_label: string;
  fact_id: string | null;
  fact_statement: string | null;
  latest_statement: string | null;
  updated_at: Date | string;
};

// ilike : % et _ de la requête sont du texte, pas des jokers.
const containsPattern = (query: string) => `%${query.replace(/[\\%_]/g, '\\$&')}%`;

function snippetOf(statement: string | null): string {
  if (!statement) return '';
  const text = oneLine(statement);
  return text.length <= SNIPPET_MAX ? text : `${text.slice(0, SNIPPET_MAX - 1)}…`;
}

// Une requête, sous la RLS du lecteur : faits qui répondent au plein texte, réunis aux fiches dont
// le titre ou un alias ressemble à la requête ; une ligne par fiche non fusionnée, meilleur score d'abord.
// `since` porte sur le recorded_at des faits visibles : le fait trouvé, et le dernier fait de la fiche.
function searchQuery(input: { query: string; type?: string; since?: Date; limit: number }) {
  const { query, type = null, since = null, limit } = input;
  return sql`
    with q as (
      select websearch_to_tsquery('french', ${query}) || websearch_to_tsquery('simple', ${query}) as tsq
    ),
    fact_hits as (
      select distinct on (f.card_id) f.card_id, f.id, f.statement, ts_rank(f.search_tsv, q.tsq) as score
      from facts f, q
      where f.search_tsv @@ q.tsq and (${since}::timestamptz is null or f.recorded_at >= ${since})
      order by f.card_id, score desc, f.id
    ),
    name_hits as (
      select c.id as card_id,
        greatest(similarity(c.title, ${query}), coalesce(max(similarity(a.alias, ${query})), 0)) as score
      from cards c left join card_aliases a on a.card_id = c.id
      where c.title % ${query} or c.title ilike ${containsPattern(query)}
        or a.alias % ${query} or a.alias ilike ${containsPattern(query)}
      group by c.id
    ),
    hits as (
      select coalesce(fh.card_id, nh.card_id) as card_id, fh.id as fact_id, fh.statement as fact_statement,
        coalesce(fh.score, 0) + coalesce(nh.score, 0) as score
      from fact_hits fh full join name_hits nh on nh.card_id = fh.card_id
    )
    select c.id, c.title, t.slug as type_slug, t.label as type_label, hits.fact_id, hits.fact_statement,
      latest.statement as latest_statement, coalesce(latest.recorded_at, c.created_at) as updated_at
    from hits
    join cards c on c.id = hits.card_id
    join card_types t on t.id = c.type_id
    left join lateral (
      select lf.statement, lf.recorded_at from facts lf
      where lf.card_id = c.id order by lf.recorded_at desc, lf.id limit 1
    ) latest on true
    where c.merged_into is null
      and (${type}::text is null or t.slug = ${type} or t.parent_slug = ${type})
      and (${since}::timestamptz is null or latest.recorded_at >= ${since})
    order by hits.score desc, c.id
    limit ${limit}`;
}

export async function searchMemory(
  ctx: TenantContext,
  input: { query: string; type?: string; since?: Date; limit?: number },
): Promise<SearchResult[]> {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const { rows } = await withTenant(ctx, (tx) => tx.execute<Row>(searchQuery({ ...input, limit })));
  return rows.map((row) => ({
    id: row.id,
    title: oneLine(row.title),
    typeSlug: row.type_slug,
    typeLabel: oneLine(row.type_label),
    snippet: snippetOf(row.fact_statement ?? row.latest_statement),
    matchedFact:
      row.fact_id && row.fact_statement ? { id: row.fact_id, statement: row.fact_statement } : null,
    updatedAt: new Date(row.updated_at),
    url: cardUrl(row.id),
  }));
}
