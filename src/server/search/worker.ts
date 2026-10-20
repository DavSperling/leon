import { resolveTenantContext } from '@/server/auth/tenant-context';
import type { Embedder } from '@/server/embeddings/embedder';
import { logError, safeErrorSummary } from '@/server/log';
import {
  getBoss,
  PIPELINE_QUEUES,
  type PipelineJob,
  PipelineJobSchema,
} from '@/server/pipeline/queue';
import { failRun } from '@/server/pipeline/runs';
import { dropOldVectors, embedMissingBatch, requeueStaleRuns } from './embed-missing';
import { indexIngestRun } from './index-run';

// Le worker de la recherche (C5) : il lit la file `index`, et deux tics par minute reprennent ce qui est
// resté en route. Il ne dépend d'aucun modèle de langage ni de la clé Anthropic : le plein texte tourne seul,
// et les vecteurs arrivent dès qu'un fournisseur est réglé.

// Jobs d'indexation traités en parallèle dans un processus : chacun lit et écrit sa propre source.
const INDEX_CONCURRENCY = 4;
// Un emplacement de pg-boss ne prend qu'un job par sondage : au sondage par défaut (2 s), quatre emplacements
// vident la file à 2 jobs par seconde, alors qu'une relève de connecteur y met un job par élément (jusqu'à 200
// par passage) et que le tic de reprise en remet 200 par minute. À 0,5 s (le minimum de pg-boss) : 8 par seconde.
const INDEX_POLLING_SECONDS = 0.5;
// Un run « en attente » depuis plus longtemps est remis en file (mise en file ratée ou job perdu).
const STALE_RUN_MINUTES = 5;
// Vecteurs complétés par lot. Un tic enchaîne les lots tant qu'il en reste, pendant au plus EMBED_TICK_MS : à un
// seul lot par minute, un million de passages demandait deux jours de rattrapage. La marge sous la minute laisse
// finir le dernier lot avant le tic suivant (un appel au fournisseur attend au plus 30 s, EMBED_TIMEOUT_MS).
const EMBED_PER_TICK = 500;
const EMBED_TICK_MS = 45_000;
// Vecteurs d'un ancien modèle retirés par tic (audit 2 n° 7 bis) : un changement de modèle sur un million de
// passages se nettoie au rythme où les nouveaux vecteurs s'écrivent.
const OLD_VECTORS_PER_TICK = 5000;
const EVERY_MINUTE = '* * * * *';

// pg-boss relance ce qu'on lui renvoie : jamais l'erreur d'origine, dont le message peut citer du texte
// capté (une erreur de base cite ses paramètres) ; seulement son résumé (safeErrorSummary).
function rethrowSummary(event: string, error: unknown, ids: Record<string, string> = {}): never {
  logError(event, error, ids);
  throw new Error(safeErrorSummary(error));
}

// Le run finit « failed » avec un résumé sans texte de conversation (failRun), puis pg-boss reprend le job :
// `indexIngestRun` refait un run « failed » sans rien doubler.
async function processIndexJob(data: unknown, deps: { embedder: Embedder | null }): Promise<void> {
  const job: PipelineJob = PipelineJobSchema.parse(data);
  try {
    await indexIngestRun(job, deps);
  } catch (error) {
    const ids = { ingestRunId: job.ingestRunId };
    logError('search.index_failed', error, ids);
    try {
      const ctx = await resolveTenantContext(job.userId, job.tenantId);
      if (ctx) await failRun(ctx, job.ingestRunId, error);
    } catch (markError) {
      logError('search.mark_failed', markError, ids);
    }
    throw new Error(safeErrorSummary(error));
  }
}

// pg-boss teste la présence de la clé : `pollingIntervalSeconds: undefined` y est refusé. Les tics, qui ne
// passent qu'une fois par minute, gardent le sondage par défaut quand l'appelant n'en donne pas.
async function registerWorkers(
  deps: { embedder: Embedder | null },
  pollingIntervalSeconds: number | undefined,
) {
  const boss = await getBoss();
  const polling = pollingIntervalSeconds === undefined ? {} : { pollingIntervalSeconds };
  await boss.work(
    PIPELINE_QUEUES.index,
    {
      batchSize: 1,
      localConcurrency: INDEX_CONCURRENCY,
      pollingIntervalSeconds: pollingIntervalSeconds ?? INDEX_POLLING_SECONDS,
    },
    async ([job]) => processIndexJob(job?.data, deps),
  );

  const tick = { batchSize: 1, localConcurrency: 1, ...polling };
  await boss.schedule(PIPELINE_QUEUES.requeue, EVERY_MINUTE);
  await boss.work(PIPELINE_QUEUES.requeue, tick, async () => {
    await requeueStaleRuns(STALE_RUN_MINUTES).catch((error) =>
      rethrowSummary('search.requeue_tick_failed', error),
    );
  });

  const { embedder } = deps;
  if (embedder) {
    await boss.schedule(PIPELINE_QUEUES.reindex, EVERY_MINUTE);
    await boss.work(PIPELINE_QUEUES.reindex, tick, async () => {
      const start = Date.now();
      // Audit 3 n° 3 : un lot lu incomplet, il n'en reste plus ; aucun vecteur écrit, le fournisseur a échoué ou
      // refusé tout le lot (le tic suivant reprendra). Un lot plein dont une partie seulement est écrite (textes
      // refusés, passages déjà vectorisés ou disparus) ne dit pas qu'il n'en reste plus.
      let batch = { read: EMBED_PER_TICK, stored: 1 };
      while (
        batch.read === EMBED_PER_TICK &&
        batch.stored > 0 &&
        Date.now() - start < EMBED_TICK_MS
      ) {
        batch = await embedMissingBatch({ embedder }, EMBED_PER_TICK).catch((error) =>
          rethrowSummary('search.embed_tick_failed', error),
        );
      }
      await dropOldVectors(embedder.model, OLD_VECTORS_PER_TICK).catch((error) =>
        rethrowSummary('search.drop_old_vectors_failed', error),
      );
    });
  } else {
    // Le tic d'un lancement précédent, avec fournisseur, resterait planifié dans la base : il remplirait
    // une file que plus personne ne lit.
    await boss.unschedule(PIPELINE_QUEUES.reindex);
  }
}

const globalForWorker = globalThis as typeof globalThis & { leonSearchWorker?: Promise<void> };

// Idempotent : le rechargement à chaud de Next réexécute `register()`.
export function startSearchWorker(
  deps: { embedder: Embedder | null },
  options: { pollingIntervalSeconds?: number } = {},
): Promise<void> {
  globalForWorker.leonSearchWorker ??= registerWorkers(deps, options.pollingIntervalSeconds).catch(
    (error) => {
      globalForWorker.leonSearchWorker = undefined; // un démarrage raté doit pouvoir être retenté
      throw error;
    },
  );
  return globalForWorker.leonSearchWorker;
}
