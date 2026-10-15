import { resolveTenantContext } from '@/server/auth/tenant-context';
import { type Llm, LlmError } from '@/server/llm/llm';
import { recordingUsage } from '@/server/llm/record-usage';
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

// Le run finit `failed` avec un résumé sans texte de conversation (failRun). Un échec ordinaire (réseau,
// 429, 5xx, délai) est ensuite relancé à pg-boss, qui reprend le job. Une LlmError (refus, réponse
// tronquée, sortie non conforme, requête refusée) se reproduirait à chaque reprise et serait facturée à
// chaque fois : le job s'arrête là, une seule fois payé. Si le run n'a pas pu être marqué, on relance
// quand même : un run qui resterait `running` sans job serait bloqué pour de bon. pg-boss stocke ce
// qu'on relance : jamais l'erreur d'origine, dont le message peut contenir du texte capté.
async function handleFailure(step: PipelineStep, job: PipelineJob, error: unknown): Promise<void> {
  const ids = { runId: job.ingestRunId, step };
  logError('pipeline.step_failed', error, ids);
  let marked = false;
  try {
    const ctx = await resolveTenantContext(job.userId, job.tenantId);
    if (ctx) {
      await failRun(ctx, job.ingestRunId, error);
      marked = true;
    }
  } catch (markError) {
    logError('pipeline.mark_failed', markError, ids);
  }
  if (error instanceof LlmError && marked) return;
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
    next = await runPipelineStep(step, job, recordingUsage(llm, job));
  } catch (error) {
    return handleFailure(step, job, error);
  }
  // Hors du try : une mise en file ratée après la validation de l'étape ne doit pas passer le run en `failed`.
  // L'erreur remonte à pg-boss, dont la reprise remet l'étape suivante en file.
  next ??= await recoverQueuedStep(job);
  if (next) await enqueuePipelineStep(next, job);
}

// pg-boss teste la présence de la clé : `pollingIntervalSeconds: undefined` y est refusé.
async function registerWorkers(llm: Llm, pollingIntervalSeconds: number | undefined) {
  const boss = await getBoss();
  const polling = pollingIntervalSeconds === undefined ? {} : { pollingIntervalSeconds };
  for (const step of Object.keys(PIPELINE_QUEUES) as PipelineStep[]) {
    await boss.work(
      PIPELINE_QUEUES[step],
      { batchSize: 1, localConcurrency: 1, ...polling },
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
