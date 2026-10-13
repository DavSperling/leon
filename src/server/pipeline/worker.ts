import { resolveTenantContext } from '@/server/auth/tenant-context';
import type { Llm } from '@/server/llm/llm';
import { logError, safeErrorSummary } from '@/server/log';
import { runExtraction } from './extraction';
import { runPlacement } from './placement/run-placement';
import {
  enqueuePipelineStep,
  getBoss,
  PIPELINE_QUEUES,
  type PipelineJob,
  PipelineJobSchema,
  type PipelineStep,
} from './queue';
import { failRun, queuedStep } from './runs';
import { runTriage } from './triage';

const STEPS: Record<PipelineStep, (job: PipelineJob, llm: Llm) => Promise<PipelineStep | null>> = {
  triage: runTriage,
  extraction: runExtraction,
  placement: runPlacement,
};

// Renvoie l'étape suivante, ou null quand le run est terminé.
export function runPipelineStep(
  step: PipelineStep,
  job: PipelineJob,
  llm: Llm,
): Promise<PipelineStep | null> {
  return STEPS[step](job, llm);
}

// Le run finit `failed` avec un résumé sans texte de conversation (failRun) ; l'échec est ensuite
// relancé à pg-boss, qui reprend le job. pg-boss stocke ce qu'on relance : jamais l'erreur d'origine,
// dont le message peut contenir du texte capté.
async function handleFailure(step: PipelineStep, job: PipelineJob, error: unknown): Promise<never> {
  const ids = { runId: job.ingestRunId, step };
  logError('pipeline.step_failed', error, ids);
  try {
    const ctx = await resolveTenantContext(job.userId, job.tenantId);
    if (ctx) await failRun(ctx, job.ingestRunId, error);
  } catch (markError) {
    logError('pipeline.mark_failed', markError, ids);
  }
  throw new Error(safeErrorSummary(error));
}

// Quand l'étape a déjà été faite par une tentative précédente (reprise pg-boss), elle ne renvoie rien : on
// retrouve alors l'étape en attente du run, que la tentative précédente n'a pas pu mettre en file.
async function recoverQueuedStep(job: PipelineJob): Promise<PipelineStep | null> {
  const ctx = await resolveTenantContext(job.userId, job.tenantId);
  return ctx ? queuedStep(ctx, job.ingestRunId) : null;
}

async function processJob(step: PipelineStep, data: unknown, llm: Llm): Promise<void> {
  const job = PipelineJobSchema.parse(data);
  let next: PipelineStep | null;
  try {
    next = await runPipelineStep(step, job, llm);
  } catch (error) {
    return handleFailure(step, job, error);
  }
  // Hors du try : une mise en file ratée après la validation de l'étape ne doit pas passer le run en `failed`.
  // L'erreur remonte à pg-boss, dont la reprise remet l'étape suivante en file.
  next ??= await recoverQueuedStep(job);
  if (next) await enqueuePipelineStep(next, job);
}

async function registerWorkers(llm: Llm, pollingIntervalSeconds: number | undefined) {
  const boss = await getBoss();
  for (const step of Object.keys(PIPELINE_QUEUES) as PipelineStep[]) {
    await boss.work(
      PIPELINE_QUEUES[step],
      { batchSize: 1, localConcurrency: 1, pollingIntervalSeconds },
      async ([job]) => processJob(step, job?.data, llm),
    );
  }
}

const globalForWorker = globalThis as typeof globalThis & { leonPipelineWorker?: Promise<void> };

// Idempotent : le rechargement à chaud de Next réexécute `register()`.
export function startPipelineWorker(
  llm: Llm,
  options: { pollingIntervalSeconds?: number } = {},
): Promise<void> {
  globalForWorker.leonPipelineWorker ??= registerWorkers(llm, options.pollingIntervalSeconds).catch(
    (error) => {
      globalForWorker.leonPipelineWorker = undefined; // un démarrage raté doit pouvoir être retenté
      throw error;
    },
  );
  return globalForWorker.leonPipelineWorker;
}
