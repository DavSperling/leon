import type { ProviderId } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestRuns, sources, turns } from '@/server/db/schema/memory';
import type { PipelineJob } from '@/server/pipeline/queue';
import { adminDb } from './db';

export type ToolTurnSeed = {
  externalId: string;
  role: 'document' | 'participant';
  authorName?: string | null;
  text: string;
  ts: string;
  inRun: boolean; // les tours hors du run sont déjà connus : ils ne servent que de contexte
};

// Une source d'outil (ACL d'équipe, comme l'ingestion des connecteurs) et un run qui ne porte que ses tours `inRun`.
export async function seedToolRun(
  ctx: TenantContext,
  input: { kind?: ProviderId; nature?: unknown; title?: string; turns: ToolTurnSeed[] },
): Promise<{ job: PipelineJob; sourceId: string; turnIds: Record<string, string> }> {
  const acl = [ctx.tenantId];
  const [source] = await adminDb
    .insert(sources)
    .values({
      tenantId: ctx.tenantId,
      kind: input.kind ?? 'github',
      externalId: crypto.randomUUID(),
      ownerUserId: ctx.userId,
      title: input.title ?? 'Délai de paiement ACME',
      acl,
      metadata: { nature: input.nature ?? 'ticket', url: 'https://example.test/1', origin: {} },
    })
    .returning({ id: sources.id });
  if (!source) throw new Error('source de test non créée');
  const rows = await adminDb
    .insert(turns)
    .values(
      input.turns.map((turn) => ({
        tenantId: ctx.tenantId,
        sourceId: source.id,
        externalId: turn.externalId,
        role: turn.role,
        authorName: turn.authorName ?? null,
        text: turn.text,
        ts: new Date(turn.ts),
        captureMode: 'connector' as const,
        acl,
      })),
    )
    .returning({ id: turns.id, externalId: turns.externalId });
  const turnIds = Object.fromEntries(rows.map((row) => [row.externalId, row.id]));
  const runTurnIds = input.turns
    .filter((turn) => turn.inRun)
    .map((turn) => turnIds[turn.externalId] as string);
  const [run] = await adminDb
    .insert(ingestRuns)
    .values({ tenantId: ctx.tenantId, sourceId: source.id, turnIds: runTurnIds, acl })
    .returning({ id: ingestRuns.id });
  if (!run) throw new Error('run de test non créé');
  return {
    job: { ingestRunId: run.id, tenantId: ctx.tenantId, userId: ctx.userId },
    sourceId: source.id,
    turnIds,
  };
}
