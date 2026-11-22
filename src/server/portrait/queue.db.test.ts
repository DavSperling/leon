import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { lignesFiche } from '@/server/db/schema/portrait';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant, seedConnection } from '@/test/fixtures';
import { enqueueFicheBuild, FICHE_QUEUE, ficheBuildPending, getFicheBoss } from './queue';
import { readFicheScreen, requestFicheBuild } from './screen';

// La file `fiche-construire` sur le vrai pg-boss de la base de test : la règle « une seule construction en attente par
// personne » est celle de la file (politique `stately`), pas du code. Aucun worker ne la lit ici : ce fichier prend
// lui-même ses travaux (fetch), et il est le seul à en mettre dans cette file, sans quoi il prendrait ceux d'un autre.

const jobs: Array<{ tenantId: string; userId: string }> = [];
const tenantIds: string[] = [];
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
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
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

// Le bouton « Construire ma fiche » (requestFicheBuild) et ce que l'écran en dit (readFicheScreen), sur la vraie file.
describe('la demande de construction et l’état « en cours »', () => {
  // Une personne d'une organisation de test, avec sa boîte Gmail si demandé.
  async function julie(mailbox: boolean) {
    const { tenantId, members } = await createTestTenant(['Julie Martin']);
    tenantIds.push(tenantId);
    const [ctx] = members;
    if (!ctx) throw new Error('personne de test non créée');
    jobs.push(ctx);
    if (mailbox) await seedConnection(ctx, { provider: 'gmail' });
    return ctx;
  }

  it('la demande met une construction en file, l’écran la dit en cours à chaque lecture, jusqu’à sa fin', async () => {
    const boss = await getFicheBoss();
    const ctx = await julie(true);
    expect((await readFicheScreen(ctx)).etat).toBe('a-construire');

    expect(await requestFicheBuild(ctx)).toBe(true);

    expect((await readFicheScreen(ctx)).etat).toBe('en-cours');
    // Une seconde demande pendant l'attente, puis pendant le travail, n'en ajoute pas.
    expect(await requestFicheBuild(ctx)).toBe(true);
    await boss.fetch(FICHE_QUEUE, { batchSize: 10 });
    expect(await requestFicheBuild(ctx)).toBe(true);
    const ids = await idsOf(ctx);
    expect(ids).toHaveLength(1);
    expect((await readFicheScreen(ctx)).etat).toBe('en-cours');

    // Le travail fini sans rien écrire (aucun mail) : l'écran propose de nouveau le bouton.
    await boss.complete(FICHE_QUEUE, ids[0] ?? '');
    expect((await readFicheScreen(ctx)).etat).toBe('a-construire');
  });

  it('une fiche calculée sans rôle se complète : la demande repart en file', async () => {
    const ctx = await julie(false);
    await adminDb.insert(lignesFiche).values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      genre: 'rythme',
      valeur: { mailsParSemaine: 12 },
      provenance: 'calcul',
      mails: 12,
      acl: [ctx.userId],
    });

    expect(await requestFicheBuild(ctx)).toBe(true);

    expect(await idsOf(ctx)).toHaveLength(1);
  });

  it('sans boîte, ou une fois le rôle écrit, la demande est refusée et rien ne part en file', async () => {
    const without = await julie(false);
    const done = await julie(true);
    await adminDb.insert(lignesFiche).values({
      tenantId: done.tenantId,
      userId: done.userId,
      genre: 'role',
      valeur: { texte: 'Commerciale.' },
      provenance: 'synthese',
      acl: [done.userId],
    });

    expect(await requestFicheBuild(without)).toBe(false);
    expect(await requestFicheBuild(done)).toBe(false);

    expect(await idsOf(without)).toEqual([]);
    expect(await idsOf(done)).toEqual([]);
  });
});
