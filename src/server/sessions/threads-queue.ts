import type { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { getBoss } from '@/server/pipeline/queue';

// Les deux files des fils de travail (T40 ; D22 et D34 du plan de la mémoire à disposition) :
// - `ranger-session` : la route des faits y met chaque session de code reçue, et le worker (threads.ts) la range dans
//   le fil de sa branche ou de ses PR. « stately », clé (organisation, session) : un seul rangement en attente et un
//   seul en cours par session. Avec `fin`, il part tout de suite ; sans, dans 15 min, et les envois suivants le
//   trouvent en attente.
// - `fil-maj` : le rangement y met un fil qui change, pour que son état soit refait (T43). « stately », clé
//   (organisation, fil), jamais la session (D34) : une mise à jour en attente et une en cours par fil. Son worker
//   vient avec T43 ; d'ici là, au plus un job attend par fil.

export const RANGEMENT_QUEUE = 'ranger-session';
export const FIL_MAJ_QUEUE = 'fil-maj';
export const RANGEMENT_IDLE_SECONDS = 15 * 60;

const QUEUE = { policy: 'stately', retryLimit: 3, retryDelay: 60, retryBackoff: true } as const;

// `sourceId` : la session à ranger, ou le fil à mettre à jour.
export const ThreadJobSchema = z.object({
  tenantId: z.uuid(),
  sourceId: z.uuid(),
  ownerUserId: z.uuid(),
});
export type ThreadJob = z.infer<typeof ThreadJobSchema>;

export const threadKey = (job: ThreadJob): string => `${job.tenantId}:${job.sourceId}`;

// Sur globalThis : le rechargement à chaud de Next réimporte ce module.
const globalForThreads = globalThis as typeof globalThis & { leonThreadsBoss?: Promise<PgBoss> };

export function getThreadsBoss(): Promise<PgBoss> {
  globalForThreads.leonThreadsBoss ??= (async () => {
    const boss = await getBoss();
    await boss.createQueue(RANGEMENT_QUEUE, QUEUE);
    await boss.createQueue(FIL_MAJ_QUEUE, QUEUE);
    return boss;
  })().catch((error) => {
    globalForThreads.leonThreadsBoss = undefined; // un démarrage raté doit pouvoir être retenté
    throw error;
  });
  return globalForThreads.leonThreadsBoss;
}

// Avec `fin` : le rangement en attente est avancé à maintenant, ou mis en file pour maintenant (comme enqueueResume) ;
// un `send` serait ignoré par la file tant que celui à 15 min attend. Sans `fin` : dans 15 min, ignoré si un rangement
// attend déjà.
export async function enqueueRangement(job: ThreadJob, options: { fin: boolean }): Promise<void> {
  const data = ThreadJobSchema.parse(job);
  const boss = await getThreadsBoss();
  const singletonKey = threadKey(data);
  if (options.fin) {
    await boss.upsert(RANGEMENT_QUEUE, data, { singletonKey, startAfter: new Date() });
    return;
  }
  await boss.send(RANGEMENT_QUEUE, data, { singletonKey, startAfter: RANGEMENT_IDLE_SECONDS });
}

export async function enqueueFilMaj(job: ThreadJob): Promise<void> {
  const data = ThreadJobSchema.parse(job);
  await (await getThreadsBoss()).send(FIL_MAJ_QUEUE, data, { singletonKey: threadKey(data) });
}
