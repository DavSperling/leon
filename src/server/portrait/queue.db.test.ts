import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { enqueueFicheBuild, FICHE_QUEUE, ficheBuildPending, getFicheBoss } from './queue';

// La file `fiche-construire` sur le vrai pg-boss de la base de test : la règle « une seule construction en attente par
// personne » est celle de la file (politique `stately`), pas du code. Aucun worker ne la lit ici : ce fichier prend
// lui-même ses travaux (fetch), et il est le seul à en mettre dans cette file, sans quoi il prendrait ceux d'un autre.

const jobs: Array<{ tenantId: string; userId: string }> = [];
const person = () => {
  const job = { tenantId: randomUUID(), userId: randomUUID() };
  jobs.push(job);
  return job;
};

async function idsOf(job: { tenantId: string; userId: string }): Promise<string[]> {
  const boss = await getFicheBoss();
  const found = await boss.findJobs(FICHE_QUEUE, { key: `${job.tenantId}:${job.userId}` });
  return found.map((one) => one.id);
}

afterAll(async () => {
  const boss = await getFicheBoss();
  for (const job of jobs) {
    const ids = await idsOf(job);
    if (ids.length > 0) await boss.deleteJob(FICHE_QUEUE, ids);
  }
  await boss.stop();
});

describe('la file fiche-construire sur le vrai pg-boss', () => {
  it('est « stately », avec deux reprises', async () => {
    const queue = await (await getFicheBoss()).getQueue(FICHE_QUEUE);

    expect(queue).toMatchObject({ policy: 'stately', retryLimit: 2 });
  });

  it('deux demandes rapprochées de la même personne n’en font qu’une ; celle d’une autre s’ajoute', async () => {
    const julie = person();
    const paul = person();

    expect(await enqueueFicheBuild(julie)).toBe(true);
    expect(await enqueueFicheBuild(julie)).toBe(false);
    expect(await enqueueFicheBuild(paul)).toBe(true);

    expect(await idsOf(julie)).toHaveLength(1);
    expect(await idsOf(paul)).toHaveLength(1);
  });

  it('une construction est en cours tant que la file ne l’a pas finie : en attente, prise, à reprendre', async () => {
    const boss = await getFicheBoss();
    const julie = person();
    expect(await ficheBuildPending(julie)).toBe(false);

    await enqueueFicheBuild(julie);
    expect(await ficheBuildPending(julie)).toBe(true);
    expect(await ficheBuildPending(person())).toBe(false);

    // Les travaux en attente des tests précédents passent devant : tous sont pris, le sien avec.
    const [id] = await idsOf(julie);
    const fetched = await boss.fetch(FICHE_QUEUE, { batchSize: 10 });
    expect(fetched.map((job) => job.id)).toContain(id);
    expect(await ficheBuildPending(julie)).toBe(true);

    // Un échec (une panne du modèle) : la file le reprendra, la construction est toujours en cours.
    await boss.fail(FICHE_QUEUE, id ?? '');
    expect((await boss.findJobs(FICHE_QUEUE, { id }))[0]?.state).toBe('retry');
    expect(await ficheBuildPending(julie)).toBe(true);
  });

  it('une construction finie n’est plus en cours', async () => {
    const boss = await getFicheBoss();
    const julie = person();
    await enqueueFicheBuild(julie);
    const [id] = await idsOf(julie);
    await boss.fetch(FICHE_QUEUE, { batchSize: 10 });

    await boss.complete(FICHE_QUEUE, id ?? '');

    expect(await ficheBuildPending(julie)).toBe(false);
  });
});
