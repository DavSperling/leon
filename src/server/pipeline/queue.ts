import { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { env } from '@/server/env';
import { logError } from '@/server/log';

export const PIPELINE_QUEUES = {
  triage: 'pipeline-triage',
  extraction: 'pipeline-extraction',
  placement: 'pipeline-placement',
} as const;
export type PipelineStep = keyof typeof PIPELINE_QUEUES;

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
