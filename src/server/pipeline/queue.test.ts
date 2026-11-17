import type { PgBoss } from 'pg-boss';
import { describe, expect, it, vi } from 'vitest';
import { logError } from '@/server/log';
import { productionSources } from '@/test/contracts/files';
import { logBossWarning, PIPELINE_QUEUES, wakeQueueAfter } from './queue';

vi.mock('@/server/log', () => ({ logError: vi.fn() }));

// Files de l'indexation que personne ne lit. Vide depuis T05 : le worker de la recherche
// (`src/server/search/worker.ts`) lit `index` (le travail), `requeue` et `reindex` (les deux tics de reprise).
// Une file ajoutée à PIPELINE_QUEUES sans lecteur y entre ici, le temps que son worker arrive : sans lecteur,
// chaque ingestion y met un job et les sources restent « En cours ».
const SANS_CONSOMMATEUR: string[] = [];

// Parcourt le code de production (hors queue.ts, qui définit les files) et rend, pour chaque motif, les clés de
// PIPELINE_QUEUES qu'il nomme. Un accès par `PIPELINE_QUEUES[étape]` (boucle sur toutes les files) les compte toutes.
function keysMatching(patterns: RegExp[]): string[] {
  const keys = Object.keys(PIPELINE_QUEUES);
  const found = new Set<string>();
  for (const { path, text } of productionSources('src/**/*.{ts,tsx}')) {
    if (path === 'src/server/pipeline/queue.ts') continue;
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        if (match[1]) found.add(match[1]);
        else for (const key of keys) found.add(key);
      }
    }
  }
  return [...found].sort();
}

// Les files lues par un `boss.work(PIPELINE_QUEUES.<clé>, …)` du code de production.
const consumedQueues = () => keysMatching([/\.work\(\s*PIPELINE_QUEUES(?:\.(\w+)|\[)/g]);

// Les files où quelque chose écrit : une mise en file (`enqueuePipelineStep('<clé>', …)`) ou un planning
// (`.schedule(PIPELINE_QUEUES.<clé>, …)`, `.send(PIPELINE_QUEUES.<clé>, …)`).
const producedQueues = () =>
  keysMatching([
    /enqueuePipelineStep\(\s*'(\w+)'/g,
    /\.(?:schedule|send)\(\s*PIPELINE_QUEUES(?:\.(\w+)|\[)/g,
  ]);

// Les files qu'un planning remplit toutes seules, sans que personne ne les appelle.
const scheduledQueues = () => keysMatching([/\.schedule\(\s*PIPELINE_QUEUES(?:\.(\w+)|\[)/g]);

describe('files du pipeline', () => {
  it('lit chaque file : aucune hors de la liste SANS_CONSOMMATEUR, qui est vide', () => {
    const sansConsommateur = Object.keys(PIPELINE_QUEUES)
      .filter((key) => !consumedQueues().includes(key))
      .sort();

    expect(sansConsommateur).toEqual([...SANS_CONSOMMATEUR].sort());
  });

  // Une file que personne n'alimente ne sert à rien et cache un oubli (un tic qu'on croit planifié).
  it('alimente chaque file : au moins une mise en file ou un planning par clé', () => {
    const sansProducteur = Object.keys(PIPELINE_QUEUES).filter(
      (key) => !producedQueues().includes(key),
    );

    expect(sansProducteur).toEqual([]);
  });

  // Une file planifiée sans lecteur se remplirait chaque minute sans bruit.
  it('lit chaque file planifiée', () => {
    const planifiees = scheduledQueues();

    expect(planifiees.length).toBeGreaterThan(0);
    expect(planifiees.filter((key) => !consumedQueues().includes(key))).toEqual([]);
  });

  it('retrouve les files de l’indexation dans les sources, pour que ces contrats ne soient pas vides', () => {
    expect(consumedQueues()).toEqual(['index', 'reindex', 'requeue']);
    expect(producedQueues()).toEqual(['index', 'reindex', 'requeue']);
    expect(scheduledQueues()).toEqual(['reindex', 'requeue']);
  });
});

// Le débit réel, avec l'écoute, est mesuré dans search/worker.db.test.ts.
describe('wakeQueueAfter', () => {
  it('réveille après chaque job, même raté, les seules boucles de sa file, et rend l’échec', async () => {
    const notifyWorker = vi.fn();
    const boss = {
      getWipData: () => [
        { id: 'a1', name: 'file-a' },
        { id: 'b1', name: 'file-b' },
        { id: 'a2', name: 'file-a' },
      ],
      notifyWorker,
    } as unknown as PgBoss;
    const handler = wakeQueueAfter(boss, 'file-a', async () => {
      throw new Error('échec');
    });

    await expect(handler([])).rejects.toThrow('échec');
    expect(notifyWorker.mock.calls).toEqual([['a1'], ['a2']]);
  });
});

describe('logBossWarning', () => {
  it('journalise l’écoute indisponible, sans ses données', () => {
    logBossWarning({
      message: 'Failed to start LISTEN/NOTIFY listener. Continuing with polling only.',
      data: { type: 'listen_notify_unavailable', error: 'connect ECONNREFUSED db.example:5432' },
    });

    expect(logError).toHaveBeenCalledTimes(1);
    const [event, error] = vi.mocked(logError).mock.calls[0] ?? [];
    expect(event).toBe('pgboss.listen_unavailable');
    expect((error as Error).message).toBe(
      'Failed to start LISTEN/NOTIFY listener. Continuing with polling only.',
    );
  });

  it('ne journalise pas les autres alertes, qui portent du SQL et des valeurs de jobs', () => {
    vi.mocked(logError).mockClear();

    logBossWarning({
      message: 'Slow query',
      data: { type: 'slow_query', sql: 'SELECT …', values: ['texte de conversation'] },
    });

    expect(logError).not.toHaveBeenCalled();
  });
});
