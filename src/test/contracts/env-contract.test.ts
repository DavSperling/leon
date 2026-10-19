import { describe, expect, it } from 'vitest';
import { productionSources, readText } from './files';

// Gérées par Next, jamais dans .env.example.
const MANAGED_BY_NEXT = ['NODE_ENV', 'NEXT_RUNTIME', 'NEXT_PHASE'];

// Fichiers dont un schéma zod nomme les variables lues.
const SCHEMA_FILES = ['src/server/env.ts', 'src/cli/env.ts', 'src/server/db/migrate-cli.ts'];

const names = (text: string, pattern: RegExp): string[] =>
  [...text.matchAll(pattern)].map((match) => match[1] as string);

function documentedVariables(): Set<string> {
  return new Set(names(readText('.env.example'), /^#?\s*([A-Z][A-Z0-9_]*)=/gm));
}

function readVariables(): Set<string> {
  const found = new Set<string>();
  for (const { path, text } of productionSources('src/**/*.{ts,tsx}', 'extension/**/*.{ts,tsx}')) {
    for (const name of names(
      text,
      /(?:process\.env|import\.meta\.env|\bsource)\.([A-Z][A-Z0-9_]*)/g,
    )) {
      found.add(name);
    }
    if (SCHEMA_FILES.includes(path)) {
      for (const name of names(text, /\b([A-Z][A-Z0-9_]*): z\./g)) found.add(name);
    }
  }
  for (const name of MANAGED_BY_NEXT) found.delete(name);
  return found;
}

describe('variables d’environnement', () => {
  it('trouve les variables que le code lit', () => {
    expect([...readVariables()].sort()).toEqual(
      expect.arrayContaining(['DATABASE_URL', 'LEON_TOKEN', 'WXT_PUBLIC_LEON_URL']),
    );
  });

  it('documente dans .env.example chaque variable lue par le code', () => {
    const documented = documentedVariables();
    expect([...readVariables()].filter((name) => !documented.has(name))).toEqual([]);
  });

  it('ne documente dans .env.example que des variables lues par le code', () => {
    const read = readVariables();
    expect([...documentedVariables()].filter((name) => !read.has(name))).toEqual([]);
  });

  it('laisse LEON_EMBEDDINGS vide dans .env.example : le fournisseur de vecteurs est à choisir par Amos et David', () => {
    const lines = readText('.env.example').split('\n');
    const index = lines.indexOf('LEON_EMBEDDINGS=');
    expect(index).toBeGreaterThan(-1);
    // Le commentaire qui précède immédiatement la variable.
    let start = index;
    while (start > 0 && lines[start - 1]?.startsWith('#')) start -= 1;
    expect(lines.slice(start, index).join(' ')).toMatch(/Amos et David/);
  });
});
