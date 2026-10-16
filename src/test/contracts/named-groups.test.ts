import { describe, expect, it } from 'vitest';
import { listFiles, readText } from './files';

// Les cellules de row-cells.tsx se montrent au survol d'un ancêtre qu'elles nomment (`group/item`) :
// un composant qui les réutilise sans cet ancêtre les laisserait invisibles, sans aucune erreur.
const CELLS = 'src/components/tasks/row-cells.tsx';

const consumedGroups = [
  ...new Set(
    [...readText(CELLS).matchAll(/group-(?:hover|focus-within|focus-visible)\/([\w-]+)/g)].map(
      (match) => match[1] as string,
    ),
  ),
];

const importers = listFiles('src/components/**/*.tsx').filter((path) =>
  /from '[^']*\/row-cells'/.test(readText(path)),
);

describe('groupes Tailwind nommés des cellules de tâche', () => {
  it('lit les groupes que les cellules consomment et les composants qui les réutilisent', () => {
    expect(consumedGroups).toContain('item');
    expect(importers.length).toBeGreaterThan(0);
  });

  it('pose chaque groupe consommé sur chaque composant qui réutilise les cellules', () => {
    const missing = importers.filter((path) => {
      const text = readText(path);
      return consumedGroups.some((name) => !text.includes(`group/${name}`));
    });
    expect(missing).toEqual([]);
  });
});
