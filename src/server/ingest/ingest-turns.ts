import { and, eq, sql } from 'drizzle-orm';
import { maskSecrets } from '@/capture/mask-secrets';
import { prepareTurnText } from '@/capture/prepare-turn-text';
import type { IngestPayload, IngestResult } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestRuns, sources, turns } from '@/server/db/schema/memory';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { logError } from '@/server/log';
import { enqueuePipelineStep } from '@/server/pipeline/queue';

// Chaque membre a sa propre source pour une conversation : la relecture ne trouve que la sienne.
async function upsertSource(
  tx: Tx,
  ctx: TenantContext,
  source: IngestPayload['source'],
  title: string | undefined,
): Promise<string> {
  const [created] = await tx
    .insert(sources)
    .values({
      tenantId: ctx.tenantId,
      kind: source.kind,
      externalId: source.external_id,
      ownerUserId: ctx.userId,
      title: title ?? null,
      acl: [ctx.userId],
    })
    .onConflictDoNothing({
      target: [sources.tenantId, sources.ownerUserId, sources.kind, sources.externalId],
    })
    .returning({ id: sources.id });
  if (created) return created.id;
  const [existing] = await tx
    .select({ id: sources.id })
    .from(sources)
    .where(
      and(
        eq(sources.tenantId, ctx.tenantId),
        eq(sources.ownerUserId, ctx.userId),
        eq(sources.kind, source.kind),
        eq(sources.externalId, source.external_id),
      ),
    );
  if (!existing) throw new Error('source introuvable après insertion');
  return existing.id;
}

// Les tours déjà connus (même source, même identifiant) et les tours vides après nettoyage sont ignorés.
async function insertNewTurns(
  tx: Tx,
  ctx: TenantContext,
  sourceId: string,
  payloadTurns: IngestPayload['turns'],
): Promise<{ ids: string[]; lastTs: Date | null }> {
  const rows = payloadTurns.flatMap((turn) => {
    const text = prepareTurnText(turn.text);
    if (text === null) return [];
    return [
      {
        tenantId: ctx.tenantId,
        sourceId,
        externalId: turn.external_id,
        role: turn.role,
        text,
        ts: new Date(turn.ts),
        captureMode: turn.capture_mode,
        acl: [ctx.userId],
      },
    ];
  });
  if (rows.length === 0) return { ids: [], lastTs: null };
  const inserted = await tx
    .insert(turns)
    .values(rows)
    .onConflictDoNothing({ target: [turns.sourceId, turns.externalId] })
    .returning({ id: turns.id });
  const lastTs = new Date(Math.max(...rows.map((row) => row.ts.getTime())));
  return { ids: inserted.map((row) => row.id), lastTs };
}

async function updateSource(
  tx: Tx,
  sourceId: string,
  title: string | undefined,
  lastTs: Date | null,
) {
  const set = {
    ...(title === undefined ? {} : { title }),
    ...(lastTs === null
      ? {}
      : { lastTurnAt: sql`greatest(${sources.lastTurnAt}, ${lastTs}::timestamptz)` }),
  };
  if (Object.keys(set).length > 0)
    await tx.update(sources).set(set).where(eq(sources.id, sourceId));
}

async function enqueueTriage(ctx: TenantContext, ingestRunId: string): Promise<void> {
  try {
    await enqueuePipelineStep('triage', {
      ingestRunId,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });
  } catch (error) {
    // Le run reste « queued » : la requête a réussi, seul le lancement du triage est à reprendre.
    logError('ingest.enqueue', error, { ingestRunId });
  }
}

export async function ingestTurns(
  ctx: TenantContext,
  payload: IngestPayload,
): Promise<IngestResult> {
  const title = payload.source.title === undefined ? undefined : maskSecrets(payload.source.title);
  const { sourceId, newTurnIds, ingestRunId } = await withTenant(ctx, async (tx) => {
    const sourceId = await upsertSource(tx, ctx, payload.source, title);
    const { ids, lastTs } = await insertNewTurns(tx, ctx, sourceId, payload.turns);
    await updateSource(tx, sourceId, title, lastTs);
    if (ids.length === 0) return { sourceId, newTurnIds: ids, ingestRunId: null };
    const [run] = await tx
      .insert(ingestRuns)
      .values({ tenantId: ctx.tenantId, sourceId, turnIds: ids, acl: [ctx.userId] })
      .returning({ id: ingestRuns.id });
    if (!run) throw new Error('ingest_run non créé');
    return { sourceId, newTurnIds: ids, ingestRunId: run.id };
  });
  if (ingestRunId !== null) await enqueueTriage(ctx, ingestRunId);
  return {
    sourceId,
    inserted: newTurnIds.length,
    skipped: payload.turns.length - newTurnIds.length,
    ingestRunId,
  };
}
