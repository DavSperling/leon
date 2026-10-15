import { count, desc, eq, sql } from 'drizzle-orm';
import { CAPTURE_KINDS, type SourceKind } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestRuns, sources, turns } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { SOURCE_KIND_LABELS } from './labels';

// Page « Sources » : santé de la capture de l'utilisateur. Rien de ce qui est lu ici ne sort du
// titre : ni texte de tour, ni message d'erreur du pipeline.

export type SourceRow = {
  id: string;
  kind: SourceKind;
  kindLabel: string;
  title: string | null;
  lastTurnAt: Date | null;
  turnCount: number;
  lastRun: {
    status: 'queued' | 'running' | 'done' | 'failed';
    step: 'triage' | 'extraction' | 'placement' | 'done';
    updatedAt: Date;
  } | null;
};
export type ChannelHealth = { kind: SourceKind; kindLabel: string; lastCaptureAt: Date | null };

export async function listSources(
  ctx: TenantContext,
): Promise<{ channels: ChannelHealth[]; sources: SourceRow[] }> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: sources.id,
        kind: sources.kind,
        title: sources.title,
        lastTurnAt: sources.lastTurnAt,
      })
      .from(sources)
      .where(eq(sources.ownerUserId, ctx.userId))
      .orderBy(sql`${sources.lastTurnAt} desc nulls last`, desc(sources.id));
    const turnCounts = await tx
      .select({ sourceId: turns.sourceId, turnCount: count() })
      .from(turns)
      .groupBy(turns.sourceId);
    const runs = await tx
      .selectDistinctOn([ingestRuns.sourceId], {
        sourceId: ingestRuns.sourceId,
        status: ingestRuns.status,
        step: ingestRuns.step,
        updatedAt: ingestRuns.updatedAt,
      })
      .from(ingestRuns)
      .orderBy(ingestRuns.sourceId, desc(ingestRuns.createdAt), desc(ingestRuns.id));

    const countBySource = new Map(turnCounts.map((row) => [row.sourceId, row.turnCount]));
    const runBySource = new Map(runs.map(({ sourceId, ...run }) => [sourceId, run]));
    const sourceRows = rows.map((row) => ({
      ...row,
      kindLabel: SOURCE_KIND_LABELS[row.kind],
      turnCount: countBySource.get(row.id) ?? 0,
      lastRun: runBySource.get(row.id) ?? null,
    }));
    return { channels: channelsOf(rows), sources: sourceRows };
  });
}

// Les sources sont triées par dernier tour décroissant : la première d'un canal est sa dernière capture.
function channelsOf(rows: Array<{ kind: SourceKind; lastTurnAt: Date | null }>): ChannelHealth[] {
  return CAPTURE_KINDS.map((kind) => ({
    kind,
    kindLabel: SOURCE_KIND_LABELS[kind],
    lastCaptureAt: rows.find((row) => row.kind === kind)?.lastTurnAt ?? null,
  }));
}
