import { eq } from 'drizzle-orm';
import { resolveTenantContext } from '@/server/auth/tenant-context';
import { ingestRuns } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import type { Llm } from '@/server/llm/llm';
import { SOURCE_KIND_LABELS } from '@/server/memory/labels';
import {
  buildTriagePrompt,
  TRIAGE_TURN_MAX_CHARS,
  TriageOutputSchema,
  type TriageResult,
} from './prompts/triage';
import type { PipelineJob, PipelineStep } from './queue';
import { advanceRun, type PipelineRun, type RunTurn, startStep } from './runs';
import { windowTurns } from './windows';

const WINDOW_MAX_CHARS = 200_000;
const TRIAGE_MAX_TOKENS = 4_000;

type SensitiveTurn = TriageResult['sensitiveTurns'][number];

// Un id que le triage renvoie sans le connaître rend sensibles tous les tours de la fenêtre (D6) :
// on échoue fermé plutôt que de laisser passer un tour sensible.
function failClosed(windowTurnList: RunTurn[], sensitiveTurns: SensitiveTurn[]): SensitiveTurn[] {
  const known = new Set(windowTurnList.map((turn) => turn.externalId));
  return sensitiveTurns.flatMap((entry) =>
    known.has(entry.turnExternalId)
      ? [entry]
      : windowTurnList.map((turn) => ({
          turnExternalId: turn.externalId,
          category: entry.category,
        })),
  );
}

async function triageWindow(
  run: PipelineRun,
  windowTurnList: RunTurn[],
  llm: Llm,
): Promise<TriageResult> {
  const prompt = buildTriagePrompt({
    sourceKindLabel: SOURCE_KIND_LABELS[run.sourceKind],
    title: run.sourceTitle,
    turns: windowTurnList,
  });
  const result = await llm.generateObject({
    step: 'triage',
    ...prompt,
    schema: TriageOutputSchema,
    maxTokens: TRIAGE_MAX_TOKENS,
  });
  const known = new Set(windowTurnList.map((turn) => turn.externalId));
  return {
    ...result,
    sensitiveTurns: failClosed(windowTurnList, result.sensitiveTurns),
    noiseTurns: result.noiseTurns.filter((id) => known.has(id)),
  };
}

function mergeResults(results: TriageResult[]): TriageResult {
  const unique = new Map(
    results
      .flatMap((result) => result.sensitiveTurns)
      .map((entry) => [`${entry.turnExternalId}|${entry.category}`, entry]),
  );
  return {
    keep: results.some((result) => result.keep),
    reason: results.map((result) => result.reason).join(' / '),
    sensitiveTurns: [...unique.values()],
    noiseTurns: [...new Set(results.flatMap((result) => result.noiseTurns))],
  };
}

// Les fenêtres se calculent sur les textes déjà tronqués, tels que le prompt les enverra.
async function triageRun(run: PipelineRun, llm: Llm): Promise<TriageResult> {
  const clipped = run.turns.map((turn) => ({
    turn,
    text: turn.text.slice(0, TRIAGE_TURN_MAX_CHARS),
  }));
  const results: TriageResult[] = [];
  for (const window of windowTurns(clipped, WINDOW_MAX_CHARS))
    results.push(
      await triageWindow(
        run,
        window.map((item) => item.turn),
        llm,
      ),
    );
  return mergeResults(results);
}

export async function runTriage(job: PipelineJob, llm: Llm): Promise<PipelineStep | null> {
  const ctx = await resolveTenantContext(job.userId, job.tenantId);
  if (!ctx) throw new Error('contexte du job introuvable');
  const run = await startStep(ctx, job.ingestRunId, 'triage');
  if (!run) return null;
  const result = await triageRun(run, llm); // appels LLM hors transaction
  const next = result.keep ? 'extraction' : null;
  await withTenant(ctx, async (tx) => {
    await tx.update(ingestRuns).set({ triage: result }).where(eq(ingestRuns.id, run.id));
    await advanceRun(tx, run.id, next ?? 'done');
  });
  return next;
}
