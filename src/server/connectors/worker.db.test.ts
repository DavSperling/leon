import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { getBoss } from '@/server/pipeline/queue';
import { adminPool } from '@/test/db';
import { fakeConnector } from '@/test/fake-connector';
import { fakeFetch } from '@/test/fake-fetch';
import { createTestTenant, seedConnection } from '@/test/fixtures';
import { CONNECTOR_QUEUES, type ConnectorSyncJob } from './queue';
import { enqueueDueSyncs } from './sync';
import type { AnyConnector } from './types';
import { startConnectorWorker } from './worker';

// Le vrai pg-boss de leon_test, mais pas le pipeline : les runs créés ne partent pas en file.
vi.mock('@/server/pipeline/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/pipeline/queue')>()),
  enqueuePipelineStep: vi.fn(),
}));

// On n'attend jamais le cron : pg-boss ne passe sur ses tâches planifiées que toutes les 30 s.
// Les connexions échues portent `next_sync_at = 2000-01-01` et sont retirées en fin de fichier.

const DUE = new Date('2000-01-01T00:00:00Z');

const tenantIds: string[] = [];
let tenantId: string;
let paul: TenantContext;
let connector: AnyConnector = fakeConnector({ items: 3, pageSize: 3 });

beforeAll(async () => {
  const team = await createTestTenant(['Paul']);
  tenantId = team.tenantId;
  [paul] = team.members as [TenantContext];
  tenantIds.push(tenantId);
  // leon_test garde la ligne de cron des lancements précédents : sans ce retrait, le test du
  // calendrier réussirait même si le démarrage ne planifiait plus rien.
  await (await getBoss()).unschedule(CONNECTOR_QUEUES.tick);
  await (await getBoss()).unschedule(CONNECTOR_QUEUES.pipedreamSweep);
  await startConnectorWorker(
    {
      getConnector: () => connector,
      fetchImpl: fakeFetch([]),
    },
    { pollingIntervalSeconds: 0.5 },
  );
});

afterAll(async () => {
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
  await (await getBoss()).stop();
});

async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

const sourceCount = async (connectionId: string) => {
  const { rows } = await adminPool.query<{ n: number }>(
    'select count(*)::int as n from sources where connection_id = $1',
    [connectionId],
  );
  return rows[0]?.n ?? 0;
};

const jobOf = (connectionId: string): ConnectorSyncJob => ({
  connectionId,
  tenantId,
  userId: paul.userId,
});

describe('worker de relève', () => {
  it('planifie le tic chaque minute', async () => {
    const boss = await getBoss();

    const schedules = await boss.getSchedules(CONNECTOR_QUEUES.tick);

    expect(schedules.map((schedule) => schedule.cron)).toContain('* * * * *');
  });

  it('planifie le balayage des utilisateurs Pipedream une fois par jour', async () => {
    const boss = await getBoss();

    const schedules = await boss.getSchedules(CONNECTOR_QUEUES.pipedreamSweep);

    expect(schedules.map((schedule) => schedule.cron)).toEqual(['0 4 * * *']);
  });

  it('crée la file de relève avec un seul job en attente par connexion et la durée de la réservation', async () => {
    const boss = await getBoss();

    const sync = await boss.getQueue(CONNECTOR_QUEUES.sync);
    const tick = await boss.getQueue(CONNECTOR_QUEUES.tick);

    expect(sync).toMatchObject({ policy: 'short', expireInSeconds: 1800, retryLimit: 2 });
    expect(tick).toMatchObject({ retryLimit: 2 });
  });

  it('synchronise une connexion dont le job est mis en file', async () => {
    const id = await seedConnection(paul, { nextSyncAt: DUE });
    const boss = await getBoss();

    await boss.send(CONNECTOR_QUEUES.sync, jobOf(id), { singletonKey: id });

    const count = await waitFor(
      () => sourceCount(id),
      (n) => n === 3,
    );
    expect(count).toBe(3);
  });

  it('relève une connexion due quand un tic arrive, sans attendre le cron', async () => {
    const id = await seedConnection(paul, { nextSyncAt: DUE });
    const boss = await getBoss();

    await boss.send(CONNECTOR_QUEUES.tick, {});

    const count = await waitFor(
      () => sourceCount(id),
      (n) => n === 3,
    );
    expect(count).toBe(3);
  });

  // Audit n° 17 : un long premier passage ne bloque pas les autres connexions.
  it('relève plusieurs connexions en même temps', async () => {
    let running = 0;
    let most = 0;
    const base = fakeConnector({ items: 1, pageSize: 1 });
    connector = {
      ...base,
      async *sync(config, state, http) {
        running += 1;
        most = Math.max(most, running);
        // Attend qu'une deuxième relève démarre (5 s au plus), puis rend la main.
        const deadline = Date.now() + 5_000;
        while (running < 2 && Date.now() < deadline)
          await new Promise((resolve) => setTimeout(resolve, 50));
        yield* base.sync(config, state, http);
        running -= 1;
      },
    };
    const ids = [
      await seedConnection(paul, { nextSyncAt: DUE }),
      await seedConnection(paul, { nextSyncAt: DUE }),
    ];
    const boss = await getBoss();

    for (const id of ids) await boss.send(CONNECTOR_QUEUES.sync, jobOf(id), { singletonKey: id });
    await waitFor(
      async () => (await Promise.all(ids.map(sourceCount))).every((n) => n === 1),
      (done) => done,
    );

    connector = fakeConnector({ items: 3, pageSize: 3 });
    expect(most).toBe(2);
  });

  it('ne met en file qu un job par connexion due, même appelé deux fois', async () => {
    const boss = await getBoss();
    await boss.offWork(CONNECTOR_QUEUES.sync); // plus personne ne prend les jobs
    const id = await seedConnection(paul, { nextSyncAt: DUE });

    await enqueueDueSyncs();
    await enqueueDueSyncs();

    const jobs = await boss.findJobs(CONNECTOR_QUEUES.sync, { key: id, queued: true });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data).toEqual(jobOf(id));
    await boss.deleteJob(
      CONNECTOR_QUEUES.sync,
      jobs.map((job) => job.id),
    );
  });
});
