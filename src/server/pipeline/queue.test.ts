import { describe, expect, it } from 'vitest';
import { productionSources } from '@/test/contracts/files';
import { PIPELINE_QUEUES } from './queue';

// Files de l'indexation que personne ne lit. Vide depuis T05 : le worker de la recherche
// (`src/server/search/worker.ts`) lit `index` (le travail), `requeue` et `reindex` (les deux tics de reprise).
// Une file ajoutée à PIPELINE_QUEUES sans lecteur y entre ici, le temps que son worker arrive : sans lecteur,
// chaque ingestion y met un job et les sources restent « En cours ».
const SANS_CONSOMMATEUR: string[] = [];

// Les files lues par un `boss.work(PIPELINE_QUEUES.<clé>, …)` du code de production ; une lecture par
// `PIPELINE_QUEUES[étape]` (boucle sur toutes les files) les compte toutes.
function consumedQueues(): string[] {
  const keys = Object.keys(PIPELINE_QUEUES);
  const consumed = new Set<string>();
  for (const { path, text } of productionSources('src/**/*.{ts,tsx}')) {
    if (path === 'src/server/pipeline/queue.ts') continue;
    for (const match of text.matchAll(/\.work\(\s*PIPELINE_QUEUES(?:\.(\w+)|\[)/g)) {
      if (match[1]) consumed.add(match[1]);
      else for (const key of keys) consumed.add(key);
    }
  }
  return [...consumed].sort();
}

describe('files du pipeline', () => {
  it('lit chaque file : aucune hors de la liste SANS_CONSOMMATEUR, qui est vide', () => {
    const sansConsommateur = Object.keys(PIPELINE_QUEUES)
      .filter((key) => !consumedQueues().includes(key))
      .sort();

    expect(sansConsommateur).toEqual([...SANS_CONSOMMATEUR].sort());
  });
});
