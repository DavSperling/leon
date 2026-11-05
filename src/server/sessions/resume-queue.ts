import type { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { getBoss } from '@/server/pipeline/queue';

// La file du résumé d'une session (T23, D9 et QD5 du plan mémoire des sessions, tranchée par Amos le 05/11) : la
// route des faits y met chaque session dont l'outil a l'usage `resume` (C7 révisé), et le worker (resume-worker.ts)
// écrit le résumé. « stately », clé (organisation, session) : un seul résumé en attente et un seul en cours par
// session. Un envoi sans `fin` met le résumé dans 15 min, et les suivants le trouvent en attente ; une vraie fin
// l'avance à 60 s. Le worker le remet lui-même en file tant que des tours arrivent (15 min sans tour).

export const RESUME_QUEUE = 'resume-session';
export const RESUME_IDLE_SECONDS = 15 * 60;
export const RESUME_END_SECONDS = 60;

const QUEUE = { policy: 'stately', retryLimit: 3, retryDelay: 60, retryBackoff: true } as const;

export const ResumeJobSchema = z.object({
  tenantId: z.uuid(),
  sourceId: z.uuid(),
  ownerUserId: z.uuid(),
});
export type ResumeJob = z.infer<typeof ResumeJobSchema>;

export const resumeKey = (job: ResumeJob): string => `${job.tenantId}:${job.sourceId}`;

// Sur globalThis : le rechargement à chaud de Next réimporte ce module.
const globalForResume = globalThis as typeof globalThis & { leonResumeBoss?: Promise<PgBoss> };

export function getResumeBoss(): Promise<PgBoss> {
  globalForResume.leonResumeBoss ??= (async () => {
    const boss = await getBoss();
    await boss.createQueue(RESUME_QUEUE, QUEUE);
    return boss;
  })().catch((error) => {
    globalForResume.leonResumeBoss = undefined; // un démarrage raté doit pouvoir être retenté
    throw error;
  });
  return globalForResume.leonResumeBoss;
}

// Avec `fin` : le résumé en attente est avancé à 60 s, ou mis en file dans 60 s (comme requestBriefingRefreshNow) ;
// un `send` serait ignoré par la file tant que le résumé à 15 min attend. Sans `fin` : dans `delaySeconds` (15 min
// par défaut), ignoré si un résumé attend déjà.
export async function enqueueResume(
  job: ResumeJob,
  options: { fin: boolean; delaySeconds?: number },
): Promise<void> {
  const data = ResumeJobSchema.parse(job);
  const boss = await getResumeBoss();
  const singletonKey = resumeKey(data);
  if (options.fin) {
    await boss.upsert(RESUME_QUEUE, data, {
      singletonKey,
      startAfter: new Date(Date.now() + RESUME_END_SECONDS * 1000),
    });
    return;
  }
  await boss.send(RESUME_QUEUE, data, {
    singletonKey,
    startAfter: options.delaySeconds ?? RESUME_IDLE_SECONDS,
  });
}
