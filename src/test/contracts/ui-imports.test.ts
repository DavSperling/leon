import { posix } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listFiles, pathExists, readText } from './files';

const UI_FILES = [
  ...listFiles('src/app/**/*.{ts,tsx}'),
  ...listFiles('src/components/**/*.{ts,tsx}'),
];

// import|export [type] ... from '<module>'
const IMPORT = /\b(?:import|export)\s+(type\s+)?([^;'"]*?)from\s+['"]([^'"]+)['"]/g;
// import '<module>' (sans rien importer) et import('<module>')
const SIDE_EFFECT_IMPORT = /\bimport\s+['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

type Import = { module: string; typeOnly: boolean };

// `import { type A, type B } from` est effacé à la compilation, comme `import type`.
function onlyTypes(clause: string): boolean {
  const names = /\{([^}]*)\}/.exec(clause)?.[1];
  if (names === undefined || clause.replace(/\{[^}]*\}/, '').replace(/[\s,]/g, '') !== '') {
    return false;
  }
  const specifiers = names.split(',').filter((name) => name.trim() !== '');
  return specifiers.length > 0 && specifiers.every((name) => /^\s*type\s/.test(name));
}

function importsOf(text: string): Import[] {
  return [
    ...[...text.matchAll(IMPORT)].map((match) => ({
      module: match[3] as string,
      typeOnly: match[1] !== undefined || onlyTypes(match[2] ?? ''),
    })),
    ...[...text.matchAll(SIDE_EFFECT_IMPORT), ...text.matchAll(DYNAMIC_IMPORT)].map((match) => ({
      module: match[1] as string,
      typeOnly: false,
    })),
  ];
}

const isModule = (module: string, name: string) => module === name || module.startsWith(`${name}/`);

// Ce qu'un code qui part dans le navigateur ne doit jamais atteindre : le serveur de Leon, la base, Node.
const SERVER_ONLY_MODULES = ['@/server', 'pg', 'drizzle-orm', 'next/headers', 'server-only'];
const isServerOnly = (module: string) =>
  module.startsWith('node:') || SERVER_ONLY_MODULES.some((name) => isModule(module, name));

const isClientFile = (text: string) => /^\s*['"]use client['"]/.test(text);
// Une action du serveur : le navigateur n'en reçoit qu'un appel à distance, pas son code.
const isServerActions = (text: string) => /^\s*['"]use server['"]/.test(text);

type Reader = (path: string) => string | undefined;

// Le fichier qu'un import désigne (`./x`, `@/x`), ou rien pour un paquet.
function resolveImport(from: string, module: string, read: Reader): string | null {
  const base = module.startsWith('@/')
    ? `src/${module.slice(2)}`
    : module.startsWith('.')
      ? posix.join(posix.dirname(from), module)
      : null;
  if (base === null) return null;
  const found = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(
    (candidate) => read(candidate) !== undefined,
  );
  return found ?? null;
}

// Les chemins qui mènent d'un composant client à un module du serveur, par des imports de valeur : un composant
// du navigateur qui importe, même par plusieurs fichiers sans directive (`result-item.tsx` n'en a pas, il vient
// d'un composant client), un module qui lit la base ou l'environnement les embarque dans le navigateur. Les
// imports de types s'effacent et ne comptent pas. Une action du serveur arrête le parcours.
function serverReach(entry: string, read: Reader): string[] {
  const chains: string[] = [];
  const seen = new Set<string>([entry]);
  const queue: Array<{ path: string; chain: string[] }> = [{ path: entry, chain: [entry] }];
  for (let next = queue.shift(); next; next = queue.shift()) {
    const text = read(next.path);
    if (text === undefined || (next.path !== entry && isServerActions(text))) continue;
    for (const { module, typeOnly } of importsOf(text)) {
      if (typeOnly) continue;
      if (isServerOnly(module)) {
        chains.push([...next.chain, module].join(' > '));
        continue;
      }
      const path = resolveImport(next.path, module, read);
      if (path === null || seen.has(path)) continue;
      seen.add(path);
      queue.push({ path, chain: [...next.chain, path] });
    }
  }
  return chains;
}

const readFile: Reader = (path) => {
  try {
    return pathExists(path) ? readText(path) : undefined;
  } catch {
    return undefined; // un dossier, par exemple
  }
};

describe('imports de l’interface', () => {
  it('trouve des fichiers à vérifier', () => {
    expect(UI_FILES.length).toBeGreaterThan(20);
    expect(UI_FILES.filter((path) => isClientFile(readText(path))).length).toBeGreaterThan(10);
  });

  it('n’importent jamais la base : @/server/db, pg, drizzle-orm', () => {
    const offenders = UI_FILES.filter((path) =>
      importsOf(readText(path)).some(({ module }) =>
        ['@/server/db', 'pg', 'drizzle-orm'].some((name) => isModule(module, name)),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('n’atteignent d’un module serveur que des types depuis un composant client, même par d’autres fichiers', () => {
    const chains = UI_FILES.filter((path) => isClientFile(readText(path))).flatMap((path) =>
      serverReach(path, readFile),
    );
    expect(chains).toEqual([]);
  });

  describe('la lecture des chemins (auto-vérification)', () => {
    const files =
      (tree: Record<string, string>): Reader =>
      (path) =>
        tree[path];

    it('trouve un module serveur importé directement', () => {
      const read = files({
        'src/components/a.tsx': `'use client';\nimport { env } from '@/server/env';`,
      });

      expect(serverReach('src/components/a.tsx', read)).toEqual([
        'src/components/a.tsx > @/server/env',
      ]);
    });

    it('le trouve à travers des fichiers sans directive, relatifs ou par alias', () => {
      const read = files({
        'src/components/a.tsx': `'use client';\nimport { x } from './b';`,
        'src/components/b.ts': `import { y } from '@/lib/c';`,
        'src/lib/c/index.ts': `import { db } from '@/server/db/client';`,
      });

      expect(serverReach('src/components/a.tsx', read)).toEqual([
        'src/components/a.tsx > src/components/b.ts > src/lib/c/index.ts > @/server/db/client',
      ]);
    });

    it('trouve la base, Node et les en-têtes de Next, sans compter les types', () => {
      const read = files({
        'src/components/a.tsx': [
          `'use client';`,
          `import type { Env } from '@/server/env';`,
          `import { type Tx } from '@/server/db/with-tenant';`,
          `import { sql } from 'drizzle-orm';`,
          `import { readFileSync } from 'node:fs';`,
          `import { cookies } from 'next/headers';`,
          `import 'server-only';`,
          `export type { Row } from '@/server/search/types';`,
          `const lazy = () => import('pg');`,
        ].join('\n'),
      });

      expect(serverReach('src/components/a.tsx', read)).toEqual([
        'src/components/a.tsx > drizzle-orm',
        'src/components/a.tsx > node:fs',
        'src/components/a.tsx > next/headers',
        'src/components/a.tsx > server-only',
        'src/components/a.tsx > pg',
      ]);
    });

    it('laisse passer une action du serveur, les paquets et les types', () => {
      const read = files({
        'src/components/a.tsx': [
          `'use client';`,
          `import { go } from '@/app/actions';`,
          `import { useState } from 'react';`,
          `import { type Row } from '@/server/search/types';`,
          `import type { Other } from '@/server/env';`,
        ].join('\n'),
        'src/app/actions.ts': `'use server';\nimport { db } from '@/server/db/client';`,
      });

      expect(serverReach('src/components/a.tsx', read)).toEqual([]);
    });

    it('ne tourne pas en rond sur des imports qui se renvoient l’un à l’autre', () => {
      const read = files({
        'src/components/a.tsx': `'use client';\nimport './b';\nimport { z } from './b';`,
        'src/components/b.ts': `import { a } from './a';`,
      });

      expect(serverReach('src/components/a.tsx', read)).toEqual([]);
    });
  });
});
