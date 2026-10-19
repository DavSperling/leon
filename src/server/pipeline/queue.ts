import { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { env } from '@/server/env';
import { logError } from '@/server/log';

// Files de l'indexation (C5) : `index` découpe en passages les tours d'un run, `reindex` et `requeue`
// reprennent ce qui est resté en route (vecteurs manquants, runs jamais mis en file).
export const PIPELINE_QUEUES = {
  index: 'pipeline-index',
  reindex: 'pipeline-reindex',
  requeue: 'pipeline-requeue',
} as const;
export type PipelineStep = keyof typeof PIPELINE_QUEUES;

// Files du tri supprimé (premier jet) : sur une base déjà utilisée, elles restent avec leurs jobs et sans lecteur.
// Le démarrage les retire (deleteQueue ne fait rien si la file n'existe pas).
const LEGACY_QUEUES = ['pipeline-triage', 'pipeline-extraction', 'pipeline-placement'];

export const PipelineJobSchema = z.object({
  ingestRunId: z.uuid(),
  tenantId: z.uuid(),
  userId: z.uuid(),
});
export type PipelineJob = z.infer<typeof PipelineJobSchema>;

const RETRY = { retryLimit: 3, retryDelay: 30, retryBackoff: true };

// Le singleton vit sur globalThis : le rechargement à chaud de Next réimporte ce module.
const globalForBoss = globalThis as typeof globalThis & { leonBoss?: Promise<PgBoss> };

async function startBoss(): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: 'pgboss',
    createSchema: false,
  });
  boss.on('error', (error) => logError('pgboss.error', error));
  await boss.start();
  for (const name of LEGACY_QUEUES) await boss.deleteQueue(name);
  for (const name of Object.values(PIPELINE_QUEUES)) await boss.createQueue(name, RETRY);
  return boss;
}

export function getBoss(): Promise<PgBoss> {
  globalForBoss.leonBoss ??= startBoss().catch((error) => {
    globalForBoss.leonBoss = undefined; // un démarrage raté doit pouvoir être retenté
    throw error;
  });
  return globalForBoss.leonBoss;
}

export async function enqueuePipelineStep(step: PipelineStep, job: PipelineJob): Promise<void> {
  const boss = await getBoss();
  await boss.send(PIPELINE_QUEUES[step], job);
}
