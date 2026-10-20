import { and, count, desc, eq, inArray, max, or, sql } from 'drizzle-orm';
import { CAPTURE_KINDS, PROVIDER_IDS, type SourceKind } from '@/capture/turn';
import { safeUrl } from '@/lib/safe-url';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestRuns, sources, turns } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { SOURCE_KIND_LABELS } from './labels';

// Page « Sources » : santé de la capture de l'utilisateur, plus ce que lisent les connexions aux
// outils (visible de toute l'équipe, sauf une source au texte brut privé, que la RLS réserve à son
// propriétaire). Rien de ce qui est lu ici ne sort du titre et du lien vers
// l'original : ni texte de tour, ni message d'erreur de l'indexation.

export type SourceRow = {
  id: string;
  kind: SourceKind;
  kindLabel: string;
  title: string | null;
  url: string | null; // lien vers l'original d'une source d'outil, en http ou https seulement (safeUrl)
  lastTurnAt: Date | null;
  turnCount: number;
  lastRun: {
    status: 'queued' | 'running' | 'done' | 'failed';
    step: 'index' | 'done';
    updatedAt: Date;
  } | null;
};
export type ChannelHealth = { kind: SourceKind; kindLabel: string; lastCaptureAt: Date | null };

// Sources par page : la page reste rapide quelle que soit la taille de la mémoire.
export const SOURCES_PAGE_SIZE = 50;

// Une page de sources, les plus récentes d'abord (`page` à partir de 1), et `hasNext` s'il en reste après elle.
// Tours et indexations ne se comptent que pour les sources de la page.
export async function listSources(
  ctx: TenantContext,
  page = 1,
): Promise<{ channels: ChannelHealth[]; sources: SourceRow[]; hasNext: boolean }> {
  return withTenant(ctx, async (tx) => {
    const found = await tx
      .select({
        id: sources.id,
        kind: sources.kind,
        title: sources.title,
        url: sql<string | null>`${sources.metadata}->>'url'`,
        lastTurnAt: sources.lastTurnAt,
      })
      .from(sources)
      // Les conversations restent à leur propriétaire, même posées avec une ACL d'équipe ; les
      // sources d'outils sont celles que la RLS laisse voir. Pas `connection_id` : il devient nul
      // quand la connexion est supprimée.
      .where(or(eq(sources.ownerUserId, ctx.userId), inArray(sources.kind, PROVIDER_IDS)))
      .orderBy(sql`${sources.lastTurnAt} desc nulls last`, desc(sources.id))
      // Une de plus que la page : elle dit seulement s'il en reste.
      .limit(SOURCES_PAGE_SIZE + 1)
      .offset((page - 1) * SOURCES_PAGE_SIZE);
    const rows = found.slice(0, SOURCES_PAGE_SIZE);
    const ids = rows.map((row) => row.id);
    const turnCounts =
      ids.length === 0
        ? []
        : await tx
            .select({ sourceId: turns.sourceId, turnCount: count() })
            .from(turns)
            .where(inArray(turns.sourceId, ids))
            .groupBy(turns.sourceId);
    const runs =
      ids.length === 0
        ? []
        : await tx
            .selectDistinctOn([ingestRuns.sourceId], {
              sourceId: ingestRuns.sourceId,
              status: ingestRuns.status,
              step: ingestRuns.step,
              updatedAt: ingestRuns.updatedAt,
            })
            .from(ingestRuns)
            .where(inArray(ingestRuns.sourceId, ids))
            .orderBy(ingestRuns.sourceId, desc(ingestRuns.createdAt), desc(ingestRuns.id));
    // La dernière capture de l'utilisateur par canal, quelle que soit la page.
    const captures = await tx
      .select({ kind: sources.kind, lastCaptureAt: max(sources.lastTurnAt) })
      .from(sources)
      .where(and(eq(sources.ownerUserId, ctx.userId), inArray(sources.kind, CAPTURE_KINDS)))
      .groupBy(sources.kind);

    const countBySource = new Map(turnCounts.map((row) => [row.sourceId, row.turnCount]));
    const runBySource = new Map(runs.map(({ sourceId, ...run }) => [sourceId, run]));
    const sourceRows = rows.map(({ url, ...row }) => ({
      ...row,
      url: safeUrl(url),
      kindLabel: SOURCE_KIND_LABELS[row.kind],
      turnCount: countBySource.get(row.id) ?? 0,
      lastRun: runBySource.get(row.id) ?? null,
    }));
    const lastByKind = new Map(captures.map((row) => [row.kind, row.lastCaptureAt]));
    const channels = CAPTURE_KINDS.map((kind) => ({
      kind,
      kindLabel: SOURCE_KIND_LABELS[kind],
      lastCaptureAt: lastByKind.get(kind) ?? null,
    }));
    return { channels, sources: sourceRows, hasNext: found.length > SOURCES_PAGE_SIZE };
  });
}

export type KindTally = {
  kind: SourceKind;
  kindLabel: string;
  sourceCount: number;
  lastTurnAt: Date | null;
};

// Ce que la mémoire garde, outil par outil : le nombre de sources que l'utilisateur peut lire (même règle que
// `listSources`) et la date de la plus récente. Les plus fournis d'abord.
export async function tallyByKind(ctx: TenantContext): Promise<KindTally[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({ kind: sources.kind, sourceCount: count(), lastTurnAt: max(sources.lastTurnAt) })
      .from(sources)
      .where(or(eq(sources.ownerUserId, ctx.userId), inArray(sources.kind, PROVIDER_IDS)))
      .groupBy(sources.kind)
      .orderBy(desc(count()), sources.kind);
    return rows.map((row) => ({
      ...row,
      // Une ligne d'un outil que ce code ne connaît plus garde son identifiant comme nom.
      kindLabel: SOURCE_KIND_LABELS[row.kind] ?? row.kind,
    }));
  });
}
