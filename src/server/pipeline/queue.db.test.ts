import { randomUUID } from 'node:crypto';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_ENV } from '@/test/test-env';
import {
  enqueuePipelineStep,
  ensureQueue,
  getBoss,
  INDEX_PRIORITY,
  PIPELINE_QUEUES,
  type PipelineJob,
} from './queue';

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

  // Audit 3 n° 5 : un tic des vecteurs plus long que la minute laissait les suivants s'empiler dans la file.
  it('ne garde dans la file du tic des vecteurs qu’un job actif et un en attente', async () => {
    const boss = await getBoss();

    expect((await boss.getQueue(PIPELINE_QUEUES.reindex))?.policy).toBe('stately');
  });

  // pg-boss ne change pas la politique d'une file qui existe déjà (celle des bases déjà utilisées).
  it('recrée avec sa politique une file créée avant avec une autre', async () => {
    const boss = await getBoss();
    const name = `test-politique-${randomUUID()}`;
    await boss.createQueue(name);
    try {
      await ensureQueue(boss, name, { policy: 'stately' });

      expect((await boss.getQueue(name))?.policy).toBe('stately');
      expect(await boss.send(name, {})).not.toBeNull();
      expect(await boss.send(name, {})).toBeNull();
    } finally {
      await boss.deleteAllJobs(name);
      await boss.deleteQueue(name);
    }
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

  // Une ingestion neuve passe devant les reprises que le tic remet en file (l'historique de la migration 0010).
  it('écrit une ingestion neuve avec une priorité plus haute que celle d’une reprise', async () => {
    const fresh: PipelineJob = {
      ingestRunId: randomUUID(),
      tenantId: randomUUID(),
      userId: randomUUID(),
    };
    const revived: PipelineJob = { ...fresh, ingestRunId: randomUUID() };

    await enqueuePipelineStep('index', fresh);
    await enqueuePipelineStep('index', revived, { priority: INDEX_PRIORITY.reprise });

    const boss = await getBoss();
    const [freshJob] = await boss.findJobs('pipeline-index', {
      data: { ingestRunId: fresh.ingestRunId },
    });
    const [revivedJob] = await boss.findJobs('pipeline-index', {
      data: { ingestRunId: revived.ingestRunId },
    });
    expect(freshJob?.priority).toBe(INDEX_PRIORITY.ingestion);
    expect(revivedJob?.priority).toBe(INDEX_PRIORITY.reprise);
    expect(INDEX_PRIORITY.ingestion).toBeGreaterThan(INDEX_PRIORITY.reprise);
    await boss.deleteJob(
      'pipeline-index',
      [freshJob, revivedJob].flatMap((job) => (job ? [job.id] : [])),
    );
  });
});
