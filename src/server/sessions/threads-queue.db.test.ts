import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  enqueueFilMaj,
  enqueueRangement,
  FIL_MAJ_QUEUE,
  getThreadsBoss,
  RANGEMENT_IDLE_SECONDS,
  RANGEMENT_QUEUE,
  type ThreadJob,
  threadKey,
} from './threads-queue';

// Les files des fils (T40), sur le vrai pg-boss de la base de test : « un seul job en attente par session », et par fil,
// est la règle de la file (politique `stately`), pas du code. Aucun worker ne lit ces files ici : ce fichier retire
// ses jobs.

const created: Array<[string, string]> = [];
const newJob = (): ThreadJob => ({
  tenantId: randomUUID(),
  sourceId: randomUUID(),
  ownerUserId: randomUUID(),
});

async function queued(queue: string, job: ThreadJob) {
  const key = threadKey(job);
  created.push([queue, key]);
  return (await getThreadsBoss()).findJobs(queue, { key, queued: true });
}

const delayOf = (startAfter: Date | undefined, before: number) =>
  ((startAfter?.getTime() ?? Number.POSITIVE_INFINITY) - before) / 1000;

afterAll(async () => {
  const boss = await getThreadsBoss();
  for (const [queue, key] of created) {
    const left = await boss.findJobs(queue, { key });
    if (left.length > 0)
      await boss.deleteJob(
        queue,
        left.map((job) => job.id),
      );
  }
  await boss.stop();
});

describe('enqueueRangement', () => {
  it('crée les deux files en politique stately', async () => {
    const boss = await getThreadsBoss();
    expect((await boss.getQueue(RANGEMENT_QUEUE))?.policy).toBe('stately');
    expect((await boss.getQueue(FIL_MAJ_QUEUE))?.policy).toBe('stately');
  });

  it('sans fin : rangée dans 15 min, et les envois suivants n’en ajoutent pas', async () => {
    const job = newJob();
    const before = Date.now();

    await enqueueRangement(job, { fin: false });
    await enqueueRangement(job, { fin: false });

    const jobs = await queued(RANGEMENT_QUEUE, job);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data).toEqual(job);
    expect(RANGEMENT_IDLE_SECONDS).toBe(15 * 60);
    expect(delayOf(jobs[0]?.startAfter, before)).toBeGreaterThan(RANGEMENT_IDLE_SECONDS - 60);
    expect(delayOf(jobs[0]?.startAfter, before)).toBeLessThan(RANGEMENT_IDLE_SECONDS + 60);
  });

  it('avec fin : le rangement en attente part tout de suite', async () => {
    const job = newJob();
    await enqueueRangement(job, { fin: false });
    const before = Date.now();

    await enqueueRangement(job, { fin: true });

    const jobs = await queued(RANGEMENT_QUEUE, job);
    expect(jobs).toHaveLength(1);
    expect(delayOf(jobs[0]?.startAfter, before)).toBeLessThan(10);
  });

  it('refuse un job dont un identifiant n’est pas un uuid', async () => {
    await expect(
      enqueueRangement({ ...newJob(), sourceId: 'evil' }, { fin: true }),
    ).rejects.toThrow();
  });
});

describe('enqueueFilMaj', () => {
  it('un seul job attend par fil, quel que soit le nombre de changements', async () => {
    const job = newJob();

    await enqueueFilMaj(job);
    await enqueueFilMaj(job);

    const jobs = await queued(FIL_MAJ_QUEUE, job);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data).toEqual(job);
  });
});
