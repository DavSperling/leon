import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getBoss } from '@/server/pipeline/queue';
import { ABOUT_RETRY_SECONDS, BRIEFING_QUEUES, getBriefingBoss } from './queue';
import { startBriefingWorker } from './worker';

// Le démarrage du worker du point du matin sur le vrai pg-boss de la base de test : pg-boss accepte le fuseau
// horaire et la règle de rattrapage du tic, et les garde. Aucun lecteur n'est branché (`work` est remplacé) : la
// file des recalculs est partagée par les fichiers de test, un vrai lecteur y prendrait leurs jobs. Ce que fait
// chaque job est vérifié dans worker.test.ts.

beforeAll(async () => {
  const boss = await getBriefingBoss();
  // Un planning laissé par un lancement précédent ferait réussir ce test même si le démarrage ne planifiait rien.
  await boss.unschedule(BRIEFING_QUEUES.morning);
  vi.spyOn(boss, 'work').mockResolvedValue('aucun-lecteur');
  await startBriefingWorker({ llm: null });
});

afterAll(async () => {
  const boss = await getBoss();
  await boss.unschedule(BRIEFING_QUEUES.morning);
  vi.restoreAllMocks();
  await boss.stop();
});

describe('startBriefingWorker sur le vrai pg-boss', () => {
  it('crée les files du recalcul, du tic du matin et des propositions « About you »', async () => {
    const boss = await getBoss();

    for (const name of Object.values(BRIEFING_QUEUES)) {
      expect((await boss.getQueue(name))?.name, name).toBe(name);
    }
    expect((await boss.getQueue(BRIEFING_QUEUES.refresh))?.policy).toBe('stately');
    expect((await boss.getQueue(BRIEFING_QUEUES.about))?.policy).toBe('stately');
  });

  it('planifie le tic chaque jour à 6 h, heure de Paris, rattrapé une fois s’il est manqué', async () => {
    const schedules = await (await getBoss()).getSchedules(BRIEFING_QUEUES.morning);

    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({ cron: '0 6 * * *', timezone: 'Europe/Paris' });
    expect(schedules[0]?.options).toMatchObject({ missed: 'once' });
  });
});

// La fenêtre de trois jours de la file des propositions (enqueueAboutProposals) est celle de pg-boss : le même
// `singletonKey` dans la même fenêtre `singletonSeconds` est refusé, quel que soit l'état du premier job. Aucun
// lecteur n'est branché sur la file : ce fichier retire les jobs qu'il crée.
describe('la fenêtre des propositions « About you » sur le vrai pg-boss', () => {
  const ids: string[] = [];
  const key = () => `${randomUUID()}:${randomUUID()}`;
  // Comme enqueueAboutProposals, et le job créé est noté pour être retiré, même si une assertion échoue ensuite.
  async function send(singletonKey: string): Promise<string | null> {
    const id = await (await getBoss()).send(
      BRIEFING_QUEUES.about,
      {},
      { singletonKey, singletonSeconds: ABOUT_RETRY_SECONDS },
    );
    if (id !== null) ids.push(id);
    return id;
  }

  // Après chaque test : le suivant lit la file (fetch) et doit n'y trouver que son job.
  afterEach(async () => {
    const created = ids.splice(0);
    if (created.length > 0) await (await getBoss()).deleteJob(BRIEFING_QUEUES.about, created);
  });

  it('garde les jobs terminés plus longtemps que la fenêtre, sans quoi la ligne effacée la lèverait', async () => {
    const queue = await (await getBoss()).getQueue(BRIEFING_QUEUES.about);

    expect(queue?.deleteAfterSeconds).toBeGreaterThan(ABOUT_RETRY_SECONDS);
  });

  it('refuse un second envoi de la même clé dans la fenêtre : un id, puis null', async () => {
    const singletonKey = key();

    const first = await send(singletonKey);
    const second = await send(singletonKey);
    const other = await send(key());

    expect(first).toEqual(expect.any(String));
    expect(second).toBeNull();
    expect(other).toEqual(expect.any(String));
  });

  it('refuse aussi la clé d’un job déjà échoué : une personne en échec n’est pas remise en file', async () => {
    const boss = await getBoss();
    const singletonKey = key();
    const id = await send(singletonKey);
    const [fetched] = await boss.fetch(BRIEFING_QUEUES.about);
    expect(fetched?.id).toBe(id);
    await boss.fail(BRIEFING_QUEUES.about, fetched?.id ?? '');

    expect(await send(singletonKey)).toBeNull();
  });
});
