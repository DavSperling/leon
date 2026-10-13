import { and, asc, eq, inArray } from 'drizzle-orm';
import type { SourceKind } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestRuns, sources, turns } from '@/server/db/schema/memory';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { safeErrorSummary } from '@/server/log';
import type { TriageResult } from './prompts/triage';
import type { PipelineStep } from './queue';

export type RunTurn = {
  id: string;
  externalId: string;
  role: 'user' | 'assistant';
  text: string;
  ts: Date;
};

export type PipelineRun = {
  id: string;
  sourceId: string;
  sourceKind: SourceKind;
  sourceTitle: string | null;
  step: string;
  status: string;
  triage: TriageResult | null;
  turns: RunTurn[];
};

const ERROR_MAX_CHARS = 200;

// Passe l'étape en `running` et charge le run avec ses tours. Une étape appelée alors que le run a avancé
// (reprise d'une étape déjà faite) ne trouve rien : null. Un run invisible pour ctx ne se démarre pas non plus.
export async function startStep(
  ctx: TenantContext,
  runId: string,
  step: PipelineStep,
): Promise<PipelineRun | null> {
  return withTenant(ctx, async (tx) => {
    const [run] = await tx
      .update(ingestRuns)
      .set({ status: 'running', updatedAt: new Date() })
      .where(and(eq(ingestRuns.id, runId), eq(ingestRuns.step, step)))
      .returning();
    if (!run) return null;
    const [source] = await tx
      .select({ kind: sources.kind, title: sources.title })
      .from(sources)
      .where(eq(sources.id, run.sourceId));
    if (!source) throw new Error('source du run introuvable');
    const runTurns = await tx
      .select({
        id: turns.id,
        externalId: turns.externalId,
        role: turns.role,
        text: turns.text,
        ts: turns.ts,
      })
      .from(turns)
      .where(inArray(turns.id, run.turnIds))
      .orderBy(asc(turns.ts), asc(turns.externalId));
    return {
      id: run.id,
      sourceId: run.sourceId,
      sourceKind: source.kind,
      sourceTitle: source.title,
      step: run.step,
      status: run.status,
      triage: run.triage as TriageResult | null,
      turns: runTurns,
    };
  });
}

// Étape en attente d'un run `queued`, ou null. Sert à une reprise dont l'étape est déjà faite : si la mise en
// file de l'étape suivante a échoué après la validation, c'est ici qu'on la retrouve.
export async function queuedStep(ctx: TenantContext, runId: string): Promise<PipelineStep | null> {
  return withTenant(ctx, async (tx) => {
    const [run] = await tx
      .select({ step: ingestRuns.step })
      .from(ingestRuns)
      .where(and(eq(ingestRuns.id, runId), eq(ingestRuns.status, 'queued')));
    return run && run.step !== 'done' ? (run.step as PipelineStep) : null;
  });
}

// `done` termine le run ; sinon le run attend l'étape suivante.
export async function advanceRun(
  tx: Tx,
  runId: string,
  next: PipelineStep | 'done',
): Promise<void> {
  await tx
    .update(ingestRuns)
    .set({ step: next, status: next === 'done' ? 'done' : 'queued', updatedAt: new Date() })
    .where(eq(ingestRuns.id, runId));
}

// Le résumé de l'erreur ne contient jamais de texte de conversation (safeErrorSummary).
export async function failRun(ctx: TenantContext, runId: string, error: unknown): Promise<void> {
  await withTenant(ctx, (tx) =>
    tx
      .update(ingestRuns)
      .set({
        status: 'failed',
        error: safeErrorSummary(error).slice(0, ERROR_MAX_CHARS),
        updatedAt: new Date(),
      })
      .where(eq(ingestRuns.id, runId)),
  );
}
