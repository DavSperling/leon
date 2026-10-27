import { describe, expect, it } from 'vitest';
import { productionSources, readText } from './files';

// Ce qui dessine sur une toile lit les couleurs du thème à l'exécution (getPropertyValue('--accent')). Une variable
// renommée dans globals.css ne casse ni le typecheck ni les tests : la toile dessine alors sans couleur, sans erreur.

const CSS = readText('src/app/globals.css');

describe('les variables CSS lues à l’exécution', () => {
  it('sont déclarées dans globals.css', () => {
    const lues = productionSources('src/**/*.ts', 'src/**/*.tsx')
      .filter(({ text }) => text.includes('getPropertyValue('))
      .flatMap(({ path, text }) =>
        [...text.matchAll(/'(--[a-z][\w-]*)'/g)].map(([, name]) => ({ path, name })),
      );
    expect(lues.length).toBeGreaterThan(0);
    expect(lues.filter(({ name }) => !CSS.includes(`${name}:`))).toEqual([]);
  });
});
