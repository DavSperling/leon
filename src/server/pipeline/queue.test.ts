import { describe, expect, it } from 'vitest';
import { productionSources } from '@/test/contracts/files';
import { PIPELINE_QUEUES } from './queue';

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
