import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  enqueueResume,
  getResumeBoss,
  RESUME_END_SECONDS,
  RESUME_IDLE_SECONDS,
  RESUME_QUEUE,
  type ResumeJob,
  resumeKey,
} from './resume-queue';

// La file du résumé (T23), sur le vrai pg-boss de la base de test : « un seul job en attente par session » est la
// règle de la file (politique `stately`), pas du code. Aucun worker ne lit la file ici : ce fichier retire ses jobs.

const keys = new Set<string>();
const newJob = (): ResumeJob => ({
  tenantId: randomUUID(),
  sourceId: randomUUID(),
  ownerUserId: randomUUID(),
});

async function queued(job: ResumeJob) {
  const key = resumeKey(job);
  keys.add(key);
  return (await getResumeBoss()).findJobs(RESUME_QUEUE, { key, queued: true });
}

const delayOf = (startAfter: Date | undefined, before: number) =>
  ((startAfter?.getTime() ?? Number.POSITIVE_INFINITY) - before) / 1000;

afterAll(async () => {
  const boss = await getResumeBoss();
  for (const key of keys) {
    const left = await boss.findJobs(RESUME_QUEUE, { key });
    if (left.length > 0)
      await boss.deleteJob(
        RESUME_QUEUE,
        left.map((job) => job.id),
      );
  }
  await boss.stop();
});

describe('enqueueResume', () => {
  it('crée la file en politique stately', async () => {
    expect((await (await getResumeBoss()).getQueue(RESUME_QUEUE))?.policy).toBe('stately');
  });

  it('sans fin : un job dans 15 min, et les envois suivants n’en ajoutent pas', async () => {
    const job = newJob();
    const before = Date.now();

    await enqueueResume(job, { fin: false });
    await enqueueResume(job, { fin: false });

    const jobs = await queued(job);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data).toEqual(job);
    expect(RESUME_IDLE_SECONDS).toBe(15 * 60);
    expect(delayOf(jobs[0]?.startAfter, before)).toBeGreaterThan(RESUME_IDLE_SECONDS - 60);
    expect(delayOf(jobs[0]?.startAfter, before)).toBeLessThan(RESUME_IDLE_SECONDS + 60);
  });

  it('un envoi sans fin puis un fin donnent un seul job, qui part 60 s après le fin', async () => {
    const job = newJob();
    await enqueueResume(job, { fin: false });
    const before = Date.now();

    await enqueueResume(job, { fin: true });

    const jobs = await queued(job);
    expect(jobs).toHaveLength(1);
    expect(RESUME_END_SECONDS).toBe(60);
    expect(delayOf(jobs[0]?.startAfter, before)).toBeGreaterThan(RESUME_END_SECONDS - 10);
    expect(delayOf(jobs[0]?.startAfter, before)).toBeLessThan(RESUME_END_SECONDS + 10);
  });

  it('un report garde son délai, et un fin qui suit l’avance', async () => {
    const job = newJob();
    const before = Date.now();

    await enqueueResume(job, { fin: false, delaySeconds: 120 });
    expect(delayOf((await queued(job))[0]?.startAfter, before)).toBeLessThan(180);
    await enqueueResume(job, { fin: true });

    const jobs = await queued(job);
    expect(jobs).toHaveLength(1);
    expect(delayOf(jobs[0]?.startAfter, before)).toBeLessThan(RESUME_END_SECONDS + 10);
  });

  it('refuse un job dont un identifiant n’est pas un uuid', async () => {
    await expect(enqueueResume({ ...newJob(), sourceId: 'evil' }, { fin: true })).rejects.toThrow();
  });
});
