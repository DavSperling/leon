import { describe, expect, it } from 'vitest';
import { productionSources } from './files';

const SOURCES = productionSources('src/server/**/*.ts');

// Les fichiers de production qui contiennent le motif.
const offenders = (pattern: RegExp): string[] =>
  SOURCES.filter(({ text }) => pattern.test(text)).map(({ path }) => path);

describe('requêtes SQL', () => {
  it('trouve le motif là où il est utilisé', () => {
    expect(offenders(/\bsql`/)).toContain('src/server/tasks/activity.ts');
  });

  it('ne passe aucun texte brut à la base : tout vaut paramètre ou colonne', () => {
    expect(offenders(/\bsql\.raw\(/)).toEqual([]);
  });

  it('exécute des requêtes étiquetées `sql`, jamais une chaîne ou un gabarit nu', () => {
    expect(offenders(/\.execute\(\s*[`'"]/)).toEqual([]);
  });
});
