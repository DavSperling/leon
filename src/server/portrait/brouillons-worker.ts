import { resolveTenantContext } from '@/server/auth/tenant-context';
import type { Llm } from '@/server/llm/llm';
import { logError, safeErrorSummary } from '@/server/log';
import { wakeQueueAfter } from '@/server/pipeline/queue';
import { writeBrouillons } from './brouillons';
import { BROUILLONS_QUEUE, getBrouillonsBoss } from './brouillons-queue';
import { FicheJobSchema } from './queue';

// Le worker de la file `brouillons-ecrire` (brouillons-queue.ts) : un passage de l'agent « Brouillons de réponse » sous
// les droits de la personne (brouillons.ts). Sans modèle branché, le passage ne fait rien. Le passage décide seul s'il
// a à travailler : elle a dit oui, l'agent lui est toujours proposé, un mail attend, le plafond du jour n'est pas
// atteint.

// Chaque passage fait au plus cinq appels au modèle de 90 secondes, l'un après l'autre, chacun suivi au plus d'un dépôt
// dans Gmail (deux requêtes, brouillon-depot.ts).
const BROUILLONS_CONCURRENCY = 2;

export async function processBrouillonsJob(
  data: unknown,
  deps: { llm: Llm | null },
): Promise<void> {
  const job = FicheJobSchema.parse(data);
  if (!deps.llm) return;
  try {
    const ctx = await resolveTenantContext(job.userId, job.tenantId);
    // Partie de l'organisation : plus personne pour qui préparer un brouillon.
    if (!ctx) return;
    await writeBrouillons(ctx, { llm: deps.llm });
  } catch (error) {
    // pg-boss garde ce qu'on lui relance : jamais l'erreur d'origine, dont le message peut citer du texte capté (une
    // erreur de base cite ses paramètres) ; seulement son résumé.
    logError('brouillons.pass_failed', error, { tenantId: job.tenantId, userId: job.userId });
    throw new Error(safeErrorSummary(error));
  }
}

const globalForWorker = globalThis as typeof globalThis & {
  leonBrouillonsWorker?: Promise<void>;
};

// Idempotent : le rechargement à chaud de Next réexécute `register()`.
export function startBrouillonsWorker(deps: { llm: Llm | null }): Promise<void> {
  globalForWorker.leonBrouillonsWorker ??= (async () => {
    const boss = await getBrouillonsBoss();
    await boss.work(
      BROUILLONS_QUEUE,
      { batchSize: 1, localConcurrency: BROUILLONS_CONCURRENCY },
      wakeQueueAfter(boss, BROUILLONS_QUEUE, async ([job]) =>
        processBrouillonsJob(job?.data, deps),
      ),
    );
  })().catch((error) => {
    globalForWorker.leonBrouillonsWorker = undefined; // un démarrage raté doit pouvoir être retenté
    throw error;
  });
  return globalForWorker.leonBrouillonsWorker;
}
