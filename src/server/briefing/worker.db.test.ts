import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getBoss } from '@/server/pipeline/queue';
import { BRIEFING_QUEUES, getBriefingBoss } from './queue';
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
  it('crée les files du recalcul et du tic du matin', async () => {
    const boss = await getBoss();

    for (const name of Object.values(BRIEFING_QUEUES)) {
      expect((await boss.getQueue(name))?.name, name).toBe(name);
    }
    expect((await boss.getQueue(BRIEFING_QUEUES.refresh))?.policy).toBe('stately');
  });

  it('planifie le tic chaque jour à 6 h, heure de Paris, rattrapé une fois s’il est manqué', async () => {
    const schedules = await (await getBoss()).getSchedules(BRIEFING_QUEUES.morning);

    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({ cron: '0 6 * * *', timezone: 'Europe/Paris' });
    expect(schedules[0]?.options).toMatchObject({ missed: 'once' });
  });
});
