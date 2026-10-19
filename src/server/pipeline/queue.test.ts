import { describe, expect, it } from 'vitest';
import { productionSources } from '@/test/contracts/files';
import { PIPELINE_QUEUES } from './queue';

// Files de l'indexation que personne ne lit encore. C'est voulu entre T02 et T05 : T05 écrit le worker de la
// recherche (`src/server/search/worker.ts`), qui lit `index`, et doit vider cette liste. Tant qu'elle n'est pas
// vide, chaque ingestion met un job dans une file sans lecteur et les sources restent « En cours ».
// Pour T05 : l'ossature de l'ancien worker (singleton idempotent, `failRun`, relance à pg-boss d'un message
// fixe) est dans l'historique, `git show 09bd94c:src/server/pipeline/worker.ts` : la reprendre plutôt que la réinventer.
const SANS_CONSOMMATEUR = ['index', 'reindex', 'requeue'];

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
  it("n'a aucun consommateur hors de la liste SANS_CONSOMMATEUR (T05 la vide)", () => {
    const sansConsommateur = Object.keys(PIPELINE_QUEUES)
      .filter((key) => !consumedQueues().includes(key))
      .sort();

    expect(sansConsommateur).toEqual([...SANS_CONSOMMATEUR].sort());
  });
});
