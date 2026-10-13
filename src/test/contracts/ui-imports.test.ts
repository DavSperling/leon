import { describe, expect, it } from 'vitest';
import { listFiles, readText } from './files';

const UI_FILES = [
  ...listFiles('src/app/**/*.{ts,tsx}'),
  ...listFiles('src/components/**/*.{ts,tsx}'),
];

// import|export [type] ... from '<module>'
const IMPORT = /\b(?:import|export)\s+(type\s+)?[^;'"]*?from\s+['"]([^'"]+)['"]/g;

type Import = { module: string; typeOnly: boolean };

function importsOf(text: string): Import[] {
  return [...text.matchAll(IMPORT)].map((match) => ({
    module: match[2] as string,
    typeOnly: match[1] !== undefined,
  }));
}

const isModule = (module: string, name: string) => module === name || module.startsWith(`${name}/`);

describe('imports de l’interface', () => {
  it('trouve des fichiers à vérifier', () => {
    expect(UI_FILES.length).toBeGreaterThan(20);
  });

  it('n’importent jamais la base : @/server/db, pg, drizzle-orm', () => {
    const offenders = UI_FILES.filter((path) =>
      importsOf(readText(path)).some(({ module }) =>
        ['@/server/db', 'pg', 'drizzle-orm'].some((name) => isModule(module, name)),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('n’importent d’un module serveur que des types dans un composant client', () => {
    const offenders = UI_FILES.filter((path) => {
      const text = readText(path);
      return (
        /^\s*['"]use client['"]/.test(text) &&
        importsOf(text).some(({ module, typeOnly }) => isModule(module, '@/server') && !typeOnly)
      );
    });
    expect(offenders).toEqual([]);
  });
});
