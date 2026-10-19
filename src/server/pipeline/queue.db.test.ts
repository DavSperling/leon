import { randomUUID } from 'node:crypto';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_ENV } from '@/test/test-env';
import { enqueuePipelineStep, getBoss, PIPELINE_QUEUES, type PipelineJob } from './queue';

// Files du tri supprimé (premier jet) : leurs jobs n'ont plus de lecteur.
const LEGACY_QUEUES = ['pipeline-triage', 'pipeline-extraction', 'pipeline-placement'];

beforeAll(async () => {
  // Une base déjà utilisée par le premier jet : les anciennes files existent et portent un job. Ce boss à part
  // les crée avant le premier `getBoss()` de ce fichier, dont le démarrage doit les retirer.
  const legacy = new PgBoss({ connectionString: TEST_ENV.DATABASE_URL, schema: 'pgboss' });
  legacy.on('error', () => {});
  await legacy.start();
  for (const name of LEGACY_QUEUES) {
    await legacy.createQueue(name);
    await legacy.send(name, { ingestRunId: randomUUID() });
  }
  await legacy.stop({ graceful: false, close: true });
});

afterAll(async () => {
  await (await getBoss()).stop();
});

describe('démarrage de pg-boss', () => {
  it('crée les files de l’indexation', async () => {
    const boss = await getBoss();

    for (const name of Object.values(PIPELINE_QUEUES)) {
      expect((await boss.getQueue(name))?.name, name).toBe(name);
    }
  });

  it('retire les files du tri supprimé, avec leurs jobs, des bases déjà utilisées', async () => {
    const boss = await getBoss();

    for (const name of LEGACY_QUEUES) expect(await boss.getQueue(name), name).toBeNull();
  });
});

describe('enqueuePipelineStep', () => {
  it('écrit un job dans la file pipeline-index de pg-boss', async () => {
    const job: PipelineJob = {
      ingestRunId: randomUUID(),
      tenantId: randomUUID(),
      userId: randomUUID(),
    };

    await enqueuePipelineStep('index', job);

    const boss = await getBoss();
    const found = await boss.findJobs('pipeline-index', { data: { ingestRunId: job.ingestRunId } });
    expect(found).toHaveLength(1);
    expect(found[0]?.data).toEqual(job);
    await boss.deleteJob(
      'pipeline-index',
      found.map((row) => row.id),
    );
  });
});
