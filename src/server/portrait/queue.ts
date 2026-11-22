import type { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { ensureQueue, getBoss } from '@/server/pipeline/queue';

// La file qui construit la fiche d'une personne (worker.ts), sur le modèle de `apropos-proposer` (briefing/queue.ts) :
// « stately », clé (organisation, personne), donc une seule construction en attente et une seule en cours par
// personne. Un échec (modèle, base) est repris deux fois, de plus en plus tard. Seul le bouton « Construire ma fiche »
// des réglages y met un travail (screen.ts) : ni tic, ni mise en route.

export const FICHE_QUEUE = 'fiche-construire';
const QUEUE = { policy: 'stately', retryLimit: 2, retryDelay: 60, retryBackoff: true } as const;

export const FicheJobSchema = z.object({ tenantId: z.uuid(), userId: z.uuid() });
type FicheJob = z.infer<typeof FicheJobSchema>;

const ficheKey = (job: FicheJob): string => `${job.tenantId}:${job.userId}`;

// Sur globalThis : le rechargement à chaud de Next réimporte ce module.
const globalForFiche = globalThis as typeof globalThis & { leonFicheBoss?: Promise<PgBoss> };

export function getFicheBoss(): Promise<PgBoss> {
  globalForFiche.leonFicheBoss ??= (async () => {
    const boss = await getBoss();
    await ensureQueue(boss, FICHE_QUEUE, QUEUE);
    return boss;
  })().catch((error) => {
    globalForFiche.leonFicheBoss = undefined; // un démarrage raté doit pouvoir être retenté
    throw error;
  });
  return globalForFiche.leonFicheBoss;
}

// Rend false quand une construction de la personne attend déjà (elle le fera).
export async function enqueueFicheBuild(job: FicheJob): Promise<boolean> {
  const data = FicheJobSchema.parse(job);
  const boss = await getFicheBoss();
  return (await boss.send(FICHE_QUEUE, data, { singletonKey: ficheKey(data) })) !== null;
}

// Une construction demandée ou en cours : un travail de la personne que la file n'a pas fini (en attente, à reprendre
// ou en cours). La file le sait seule, aucune table ne le redit.
export async function ficheBuildPending(job: FicheJob): Promise<boolean> {
  const boss = await getFicheBoss();
  const jobs = await boss.findJobs(FICHE_QUEUE, { key: ficheKey(job) });
  return jobs.some(({ state }) => state === 'created' || state === 'retry' || state === 'active');
}
