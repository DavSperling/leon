import { resolveTenantContext } from '@/server/auth/tenant-context';
import type { Llm } from '@/server/llm/llm';
import { logError, safeErrorSummary } from '@/server/log';
import { wakeQueueAfter } from '@/server/pipeline/queue';
import { buildFiche } from './fiche';
import { FICHE_QUEUE, FicheJobSchema, getFicheBoss } from './queue';
import { synthesizeFiche } from './synthese';

// Le worker de la file `fiche-construire` (queue.ts) : sous les droits de la personne, ses lignes calculées d'abord
// (fiche.ts), puis son rôle et ses tâches par le modèle (synthese.ts). Sans modèle, les lignes calculées s'écrivent
// quand même. Une panne du modèle les laisse en place, et pg-boss reprend le travail : la synthèse ne se fait qu'une
// fois (synthese.ts), une reprise après elle ne rappelle pas le modèle.
// shortcut: aucun plafond d'appels : tant que la synthèse n'écrit rien (une réponse du modèle sans ligne valide),
// chaque demande de la personne paie un appel de plus, à borner par personne si le journal `fiche.synthesized` le
// montre.

// Chaque construction est un appel au modèle de trois minutes au plus.
const FICHE_CONCURRENCY = 2;

export async function processFicheJob(data: unknown, deps: { llm: Llm | null }): Promise<void> {
  const job = FicheJobSchema.parse(data);
  try {
    const ctx = await resolveTenantContext(job.userId, job.tenantId);
    // Partie de l'organisation : plus personne à qui écrire une fiche.
    if (!ctx) return;
    await buildFiche(ctx);
    if (deps.llm) await synthesizeFiche(ctx, { llm: deps.llm });
  } catch (error) {
    // pg-boss garde ce qu'on lui relance : jamais l'erreur d'origine, dont le message peut citer du texte capté (une
    // erreur de base cite ses paramètres) ; seulement son résumé.
    logError('fiche.build_failed', error, { tenantId: job.tenantId, userId: job.userId });
    throw new Error(safeErrorSummary(error));
  }
}

const globalForWorker = globalThis as typeof globalThis & { leonFicheWorker?: Promise<void> };

// Idempotent : le rechargement à chaud de Next réexécute `register()`.
export function startFicheWorker(deps: { llm: Llm | null }): Promise<void> {
  globalForWorker.leonFicheWorker ??= (async () => {
    const boss = await getFicheBoss();
    await boss.work(
      FICHE_QUEUE,
      { batchSize: 1, localConcurrency: FICHE_CONCURRENCY },
      wakeQueueAfter(boss, FICHE_QUEUE, async ([job]) => processFicheJob(job?.data, deps)),
    );
  })().catch((error) => {
    globalForWorker.leonFicheWorker = undefined; // un démarrage raté doit pouvoir être retenté
    throw error;
  });
  return globalForWorker.leonFicheWorker;
}
