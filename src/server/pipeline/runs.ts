import { and, asc, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { SourceKind, TurnRole } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestRuns, sources, turns } from '@/server/db/schema/memory';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { safeErrorSummary } from '@/server/log';
import type { TriageResult } from './prompts/triage';
import type { PipelineStep } from './queue';

// Ce que la source est : une conversation avec un assistant, ou un élément d'un outil (C4 du plan des connecteurs).
export const ITEM_NATURES = ['conversation', 'reunion', 'page', 'ticket', 'fil', 'note'] as const;
export type ItemNature = (typeof ITEM_NATURES)[number];

export type RunTurn = {
  id: string;
  externalId: string;
  role: TurnRole;
  authorName: string | null;
  text: string;
  ts: Date;
};

export type PipelineRun = {
  id: string;
  sourceId: string;
  sourceKind: SourceKind;
  sourceTitle: string | null;
  nature: ItemNature;
  context: string | null;
  step: string;
  status: string;
  triage: TriageResult | null;
  turns: RunTurn[];
};

const ERROR_MAX_CHARS = 200;
const CONTEXT_MAX_CHARS = 4_000;
const CONTEXT_MAX_TURNS = 50;
const CONTEXT_TRUNCATION_MARK = '[…]';
// La nature vient d'un champ libre (metadata) : une valeur inconnue vaut conversation.
const NatureSchema = z.enum(ITEM_NATURES).catch('conversation');

// Un run ne porte que les tours nouveaux : pour une source d'outil, le texte des tours `document` déjà connus
// (du plus récent au plus ancien) rappelle l'état que ces tours commentent ou corrigent. Il n'est pas citable.
async function loadContext(tx: Tx, sourceId: string, runTurnIds: string[]): Promise<string | null> {
  const known = await tx
    .select({ text: turns.text })
    .from(turns)
    .where(
      and(
        eq(turns.sourceId, sourceId),
        eq(turns.role, 'document'),
        notInArray(turns.id, runTurnIds),
      ),
    )
    .orderBy(desc(turns.ts), asc(turns.externalId))
    .limit(CONTEXT_MAX_TURNS);
  if (known.length === 0) return null;
  const text = known.map((row) => row.text).join('\n\n');
  if (text.length <= CONTEXT_MAX_CHARS) return text;
  return `${text.slice(0, CONTEXT_MAX_CHARS - CONTEXT_TRUNCATION_MARK.length)}${CONTEXT_TRUNCATION_MARK}`;
}

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
      .select({
        kind: sources.kind,
        title: sources.title,
        nature: sql<string | null>`${sources.metadata}->>'nature'`,
      })
      .from(sources)
      .where(eq(sources.id, run.sourceId));
    if (!source) throw new Error('source du run introuvable');
    const runTurns = await tx
      .select({
        id: turns.id,
        externalId: turns.externalId,
        role: turns.role,
        authorName: turns.authorName,
        text: turns.text,
        ts: turns.ts,
      })
      .from(turns)
      .where(inArray(turns.id, run.turnIds))
      .orderBy(asc(turns.ts), asc(turns.externalId));
    const nature = NatureSchema.parse(source.nature);
    return {
      id: run.id,
      sourceId: run.sourceId,
      sourceKind: source.kind,
      sourceTitle: source.title,
      nature,
      context: nature === 'conversation' ? null : await loadContext(tx, run.sourceId, run.turnIds),
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
