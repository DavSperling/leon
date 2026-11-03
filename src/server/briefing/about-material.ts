import { sql } from 'drizzle-orm';
import { PROVIDER_IDS } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';
import { LAST_TS_SQL, textArray } from '@/server/search/filters-sql';
import type { SourceInfo } from '@/server/search/types';
import { type BriefingExcerpt, lastTurns, sourceOf } from './gather';

// La matière de la proposition « About you » (onboarding, lot 5) : les sources de la personne, et elles seules.
// Elle se lit sous withTenant de la personne ET avec le filtre `owner_user_id` : la sécurité par ligne laisse voir les
// sources de l'espace, la proposition n'envoie au modèle que ce qui est à elle. Les outils de l'équipe qu'un autre a
// branchés et les conversations avec les assistants n'y entrent pas (PROVIDER_IDS ne les contient pas).

// Les sources actives depuis moins de 30 jours, les plus récentes d'abord, 40 au plus, et leurs 2 derniers tours.
const ABOUT_DAYS = 30;
const ABOUT_SOURCES_MAX = 40;
const ABOUT_TURNS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AboutMaterial = { sources: Array<{ source: SourceInfo; turns: BriefingExcerpt[] }> };

export async function gatherAboutMaterial(ctx: TenantContext, now: Date): Promise<AboutMaterial> {
  const cutoff = new Date(now.getTime() - ABOUT_DAYS * DAY_MS);
  return withTenant(ctx, async (tx) => {
    const { rows } = await tx.execute<Parameters<typeof sourceOf>[0]>(sql`
      select s.id, s.kind, s.title, s.metadata, extract(epoch from l.last_ts) as last_epoch
      from sources s
      cross join lateral (select ${LAST_TS_SQL} as last_ts) l
      where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId}
        and s.kind = any(${textArray(PROVIDER_IDS)})
        and l.last_ts >= ${cutoff.toISOString()}::timestamptz
      order by l.last_ts desc, s.id
      limit ${ABOUT_SOURCES_MAX}`);
    const turns = await lastTurns(
      tx,
      ctx,
      rows.map((row) => row.id),
      ABOUT_TURNS,
    );
    return {
      sources: rows.map((row) => ({ source: sourceOf(row), turns: turns.get(row.id) ?? [] })),
    };
  });
}
