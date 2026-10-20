import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { createFakeEmbedder } from '@/server/embeddings/fake-embedder';
import {
  enqueuePipelineStep,
  getBoss,
  INDEX_PRIORITY,
  PIPELINE_QUEUES,
  type PipelineJob,
} from '@/server/pipeline/queue';
import { adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { seedRun } from '@/test/seed-search';
import { embedMissingBatch, requeueStaleRuns } from './embed-missing';
import { startSearchWorker } from './worker';

// Le vrai pg-boss de la base de test, sans aucune option de sondage : c'est ce que fait la production. Les
// autres fichiers de ce dossier appellent `indexIngestRun` à la main ou simulent pg-boss, et ne voient donc ni
// le débit réel de la file, ni une option que pg-boss refuserait.
//
// Les deux tics de reprise sont remplacés : ils lisent les runs de TOUTE la base, que les autres fichiers y
// laissent « en attente », et ils en reprendraient 200 par minute pendant ce test. Leur branchement sur la file
// se vérifie ici en leur envoyant un job ; leur contenu l'est dans embed-missing.db.test.ts.
vi.mock('./embed-missing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./embed-missing')>()),
  requeueStaleRuns: vi.fn(async () => 0),
  embedMissingBatch: vi.fn(async () => ({ read: 0, stored: 0, removed: 0 })),
}));

// La file peut déjà porter des jobs d'autres essais (reprises laissées par un ancien lancement) : ce fichier ne
// compte que sur ses propres runs.
const tenantIds: string[] = [];
const factice = createFakeEmbedder();
let alice: TenantContext;
const myRunIds: string[] = [];

const globalForWorker = globalThis as typeof globalThis & { leonSearchWorker?: Promise<void> };

beforeAll(async () => {
  const team = await createTestTenant(['Alice']);
  [alice] = team.members as [TenantContext];
  tenantIds.push(team.tenantId);
  // Les plannings des lancements précédents resteraient dans la base : sans ce retrait, le test des plannings
  // réussirait même si le démarrage ne planifiait plus rien.
  const boss = await getBoss();
  await boss.unschedule(PIPELINE_QUEUES.requeue);
  await boss.unschedule(PIPELINE_QUEUES.reindex);
  await startSearchWorker({ embedder: factice });
});

afterAll(async () => {
  const boss = await getBoss();
  // Les jobs de reprise de ce fichier qui n'ont pas été lus ne doivent pas rester dans la file.
  for (const ingestRunId of myRunIds) {
    const left = await boss.findJobs(PIPELINE_QUEUES.index, { data: { ingestRunId } });
    if (left.length > 0)
      await boss.deleteJob(
        PIPELINE_QUEUES.index,
        left.map((job) => job.id),
      );
  }
  await boss.unschedule(PIPELINE_QUEUES.requeue);
  await boss.unschedule(PIPELINE_QUEUES.reindex);
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
  await boss.stop();
});

async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean, seconds = 15) {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// Un run d'un seul tour, prêt à être indexé.
async function trivialRun(): Promise<PipelineJob> {
  const { job } = await seedRun(alice, { turns: [{ text: 'Le contrat OVH est renouvelé.' }] });
  myRunIds.push(job.ingestRunId);
  return job;
}

async function statuses(runIds: string[]): Promise<string[]> {
  const { rows } = await adminPool.query<{ status: string }>(
    'select status from ingest_runs where id = any($1)',
    [runIds],
  );
  return rows.map((row) => row.status);
}

const doneCount = async (runIds: string[]) =>
  (await statuses(runIds)).filter((status) => status === 'done').length;

describe('worker de recherche sur le vrai pg-boss', () => {
  it('planifie les deux tics de reprise chaque minute quand un fournisseur est réglé', async () => {
    const boss = await getBoss();

    const requeue = await boss.getSchedules(PIPELINE_QUEUES.requeue);
    const reindex = await boss.getSchedules(PIPELINE_QUEUES.reindex);

    expect(requeue.map((schedule) => schedule.cron)).toEqual(['* * * * *']);
    expect(reindex.map((schedule) => schedule.cron)).toEqual(['* * * * *']);
  });

  it('indexe de bout en bout un run mis en file : passages, vecteurs et run terminé', async () => {
    const job = await trivialRun();

    await enqueuePipelineStep('index', job);

    await waitFor(
      () => statuses([job.ingestRunId]),
      ([status]) => status === 'done',
    );
    const { rows } = await adminPool.query<{ passages: number; vectors: number }>(
      `select (select count(*) from passages where source_id = r.source_id)::int as passages,
              (select count(*) from passage_vectors v join passages p on p.id = v.passage_id
               where p.source_id = r.source_id and v.model = $2)::int as vectors
       from ingest_runs r where r.id = $1`,
      [job.ingestRunId, factice.model],
    );
    expect(await statuses([job.ingestRunId])).toEqual(['done']);
    expect(rows[0]).toEqual({ passages: 1, vectors: 1 });
  });

  // Mesuré avec pg-boss 12 : un emplacement ne prend qu'un job par sondage, soit environ 2 jobs par seconde
  // au sondage par défaut (2 s), 9 jobs par seconde à 0,5 s. Une relève de connecteur met un job par élément
  // dans la file : à 2 par seconde, 200 éléments demandent plus d'une minute.
  it('vide la file à plus de 5 jobs par seconde avec les réglages de production', async () => {
    const jobs = await Promise.all(Array.from({ length: 30 }, trivialRun));

    const started = performance.now();
    for (const job of jobs) await enqueuePipelineStep('index', job);
    const ids = jobs.map((job) => job.ingestRunId);
    const done = await waitFor(
      () => doneCount(ids),
      (count) => count === ids.length,
      30,
    );
    const seconds = (performance.now() - started) / 1000;

    expect(done).toBe(30);
    expect(seconds).toBeLessThan(10);
  }, 40_000);

  // La migration 0010 a remis tout l'historique en attente, et le tic de reprise le met en file à raison de 200
  // par minute : un élément neuf ne doit pas attendre derrière cet historique.
  it('lit un run neuf avant les jobs de reprise déjà dans la file', async () => {
    const revived = await Promise.all(Array.from({ length: 20 }, trivialRun));
    const fresh = await trivialRun();
    for (const job of revived) {
      await enqueuePipelineStep('index', job, { priority: INDEX_PRIORITY.reprise });
    }

    await enqueuePipelineStep('index', fresh);

    await waitFor(
      () => statuses([fresh.ingestRunId]),
      ([status]) => status === 'done',
      10,
    );
    const revivedDone = await doneCount(revived.map((job) => job.ingestRunId));
    expect(await statuses([fresh.ingestRunId])).toEqual(['done']);
    // Les 20 reprises demandent plusieurs secondes : si le run neuf est passé derrière, elles sont toutes faites.
    expect(revivedDone).toBeLessThan(15);
  }, 30_000);

  it('lit les deux files des tics : un job envoyé lance la reprise des runs, puis des vecteurs', async () => {
    const boss = await getBoss();
    vi.mocked(requeueStaleRuns).mockClear();
    vi.mocked(embedMissingBatch).mockClear();

    await boss.send(PIPELINE_QUEUES.requeue, {});
    await boss.send(PIPELINE_QUEUES.reindex, {});

    await waitFor(
      async () => [
        vi.mocked(requeueStaleRuns).mock.calls.length,
        vi.mocked(embedMissingBatch).mock.calls.length,
      ],
      ([requeue, reindex]) => (requeue ?? 0) > 0 && (reindex ?? 0) > 0,
    );
    expect(requeueStaleRuns).toHaveBeenCalledWith(5);
    expect(embedMissingBatch).toHaveBeenCalledWith({ embedder: factice }, 500);
  });

  it('retire le tic des vecteurs de la base quand le worker redémarre sans fournisseur', async () => {
    const boss = await getBoss();
    await boss.offWork(PIPELINE_QUEUES.index);
    await boss.offWork(PIPELINE_QUEUES.requeue);
    await boss.offWork(PIPELINE_QUEUES.reindex);
    delete globalForWorker.leonSearchWorker;

    await startSearchWorker({ embedder: null });

    expect(await boss.getSchedules(PIPELINE_QUEUES.reindex)).toEqual([]);
    const requeue = await boss.getSchedules(PIPELINE_QUEUES.requeue);
    expect(requeue.map((schedule) => schedule.cron)).toEqual(['* * * * *']);
  });
});
