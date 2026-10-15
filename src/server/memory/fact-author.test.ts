import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Garde de contrat. Pour un fait tiré d'un outil, `facts.author_id` est celui qui a branché la
// connexion, pas l'auteur du texte cité. Tout lecteur qui joint `users` sur cette colonne doit donc
// passer par `factAuthorName` (labels.ts), sinon l'écran attribue les faits d'un outil à la
// mauvaise personne : c'est déjà arrivé dans « À vérifier ».

const SERVER = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const JOINS_USERS_ON_FACT_AUTHOR =
  /eq\(\s*(?:users\.id\s*,\s*facts\.authorId|facts\.authorId\s*,\s*users\.id)\s*\)/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('auteur d’un fait', () => {
  it('passe toujours par factAuthorName quand un lecteur joint users sur facts.authorId', () => {
    const readers = sourceFiles(SERVER).filter((path) =>
      JOINS_USERS_ON_FACT_AUTHOR.test(readFileSync(path, 'utf8')),
    );

    expect(readers.length).toBeGreaterThan(0); // la garde voit bien les lecteurs existants
    const unsafe = readers.filter(
      (path) => !readFileSync(path, 'utf8').includes('factAuthorName('),
    );
    expect(unsafe.map((path) => path.slice(SERVER.length + 1))).toEqual([]);
  });
});
