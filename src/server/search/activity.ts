import { type SQL, sql } from 'drizzle-orm';
import type { TurnRole } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import {
  epochToDate,
  LAST_TS_SQL,
  passageConditions,
  sourceConditions,
  sourceInfoFrom,
} from './filters-sql';
import type { SearchFilters, SourceHit } from './types';

// L'activité récente : les sources que le lecteur voit et qui passent les filtres, les plus récentes d'abord,
// sans rien chercher. Sert à une recherche faite de filtres seuls (`outil:github`), à l'outil « activité » de
// la discussion et à ce qui a bougé dans le point du matin.

// Au plus ce nombre de sources par appel : le reste se lit page après page.
export const ACTIVITY_MAX = 100;
// Longueur de l'extrait d'un passage montré sans mot à surligner.
const SNIPPET_CHARS = 240;

type ActivityRow = {
  total: number;
  source_id: string | null;
  kind: string | null;
  title: string | null;
  metadata: unknown;
  last_epoch: string | null;
  passage_id: string | null;
  turn_id: string | null;
  epoch: string | null;
  author_name: string | null;
  role: TurnRole | null;
};

// Les sources qui passent les filtres (une source dont au moins un passage passe les filtres de date et
// d'auteur), la plus récente d'abord, chacune avec son passage le plus récent qui les passe. `total` : combien
// de sources passent les filtres, toutes pages confondues. À appeler sous `withTenant`. `passageWhere` : une
// condition de plus sur chaque passage `p` (les mots niés d'une recherche faite de filtres, « de:marie -budget ») ;
// `sourceWhere`, sur la source `s` (les mêmes mots niés, dans son titre).
export async function recentSources(
  tx: Tx,
  ctx: TenantContext,
  filters: SearchFilters,
  page: { limit: number; offset: number },
  passageWhere: SQL = sql`true`,
  sourceWhere: SQL = sql`true`,
): Promise<{ hits: SourceHit[]; total: number }> {
  const { rows } = await tx.execute<ActivityRow & { snippet: string | null }>(sql`
    with matching as (
      select s.id as source_id, s.kind, s.title, s.metadata, ${LAST_TS_SQL} as last_ts
      from sources s
      where s.tenant_id = ${ctx.tenantId}
        and ${sourceConditions(filters)}
        and ${sourceWhere}
        and exists (
          select 1 from passages p
          where p.tenant_id = s.tenant_id and p.source_id = s.id and ${passageConditions(filters, sql`s.kind`)}
            and ${passageWhere})
    )
    select tt.total, pg.source_id, pg.kind, pg.title, pg.metadata,
           extract(epoch from pg.last_ts) as last_epoch,
           pp.passage_id, pp.turn_id, extract(epoch from pp.ts) as epoch, pp.author_name, pp.snippet,
           (select pt.role from turns pt where pt.tenant_id = ${ctx.tenantId} and pt.id = pp.turn_id) as role
    from (select count(*)::int as total from matching) tt
    left join lateral (
      select * from matching order by last_ts desc, source_id
      offset ${page.offset} limit ${page.limit}
    ) pg on true
    left join lateral (
      select p.id as passage_id, p.turn_id, p.ts, p.author_name, left(p.text, ${SNIPPET_CHARS}) as snippet
      from passages p
      where p.tenant_id = ${ctx.tenantId} and p.source_id = pg.source_id
        and ${passageConditions(filters, sql`pg.kind`)} and ${passageWhere}
      order by p.ts desc, p.ord desc
      limit 1
    ) pp on true
    order by pg.last_ts desc, pg.source_id`);
  const hits: SourceHit[] = [];
  for (const row of rows) {
    if (row.source_id === null || row.kind === null || row.last_epoch === null) continue;
    const passages =
      row.passage_id === null || row.turn_id === null || row.epoch === null
        ? []
        : [
            {
              passageId: row.passage_id,
              turnId: row.turn_id,
              snippet: row.snippet ?? '',
              ts: epochToDate(row.epoch),
              authorName: row.author_name,
              role: row.role,
            },
          ];
    hits.push({
      ...sourceInfoFrom({
        id: row.source_id,
        kind: row.kind,
        title: row.title,
        metadata: row.metadata,
        lastTs: epochToDate(row.last_epoch),
      }),
      passages,
      score: 0,
    });
  }
  return { hits, total: rows[0]?.total ?? 0 };
}

export async function listActivity(
  ctx: TenantContext,
  input: { filters: SearchFilters; limit: number },
): Promise<SourceHit[]> {
  const limit = Number.isFinite(input.limit)
    ? Math.min(Math.max(Math.floor(input.limit), 0), ACTIVITY_MAX)
    : 0;
  if (limit === 0) return [];
  const { hits } = await withTenant(ctx, (tx) =>
    recentSources(tx, ctx, input.filters, { limit, offset: 0 }),
  );
  return hits;
}
