import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, matchesGlob } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import config from '../wxt.config';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

// WXT ramasse ce qui est sur le disque, que Git le suive ou non (node_modules/wxt/dist/core/zip.mjs:70-75) ; il
// retire lui-même les tests et node_modules (resolve-config.mjs:202-209), puis excludeSources.
const included = (file: string) =>
  (config.zip?.includeSources ?? []).some((glob) => matchesGlob(file, glob)) &&
  !(config.zip?.excludeSources ?? []).some((glob) => matchesGlob(file, glob));

const tracked = (...paths: string[]): string[] =>
  execFileSync('git', ['ls-files', ...paths], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((file) => file && !file.endsWith('.test.ts'));

// Les alias de WXT (@, ~, @@, ~~) mènent tous au dossier extension/ (extension/.wxt/tsconfig.json).
const ALIAS = /^(@@|~~|@|~)\//;

// Le fichier du dépôt qu'un import désigne, ou null pour un paquet (zod, wxt, #imports, node:…).
function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('.') && !ALIAS.test(spec)) return null;
  const local = spec.startsWith('.')
    ? join(dirname(from), spec)
    : spec.replace(ALIAS, 'extension/');
  const file = [local, `${local}.ts`, `${local}/index.ts`].find(
    (path) => existsSync(join(ROOT, path)) && statSync(join(ROOT, path)).isFile(),
  );
  if (!file) throw new Error(`${from} importe ${spec}, introuvable`);
  return file;
}

// Ce que la construction lit dans le dépôt : les points d'entrée et wxt.config.ts, puis, de proche en proche, chaque
// import d'un .ts et chaque src ou href relatif d'une page. public/ est copié à part, en entier.
// shortcut: lit les imports par une expression régulière (chaînes entre apostrophes, comme les écrit Biome ; ni
// import construit à l'exécution, ni @import CSS), passer au graphe de modules de Vite le jour où l'extension en écrit un.
function buildInputs(): Set<string> {
  const seen = new Set<string>();
  const queue = [...tracked('extension/entrypoints'), 'extension/wxt.config.ts'];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(join(ROOT, file), 'utf8');
    const specs = file.endsWith('.html')
      ? text.matchAll(/(?:src|href)="(\.[^"]+)"/g)
      : text.matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g);
    for (const [, spec] of specs) {
      const path = resolveImport(file, spec as string);
      if (path) queue.push(path);
    }
  }
  return seen;
}

describe('le zip des sources pour Mozilla', () => {
  it('prend les fichiers qui servent à reconstruire l’extension', () => {
    for (const file of [
      'extension/assets/leon.css',
      'extension/entrypoints/background.ts',
      'extension/entrypoints/options/index.html',
      'extension/lib/parsers/chatgpt.ts',
      'extension/tsconfig.json',
      'extension/wxt.config.ts',
      'extension/build-firefox.md',
      'extension/public/icon/16.png',
      'extension/public/_locales/en/messages.json',
      'src/capture/turn.ts',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      // Vite transforme src/capture avec le tsconfig de la racine.
      'tsconfig.json',
    ]) {
      expect(included(file), file).toBe(true);
    }
  });

  it('prend chaque fichier que la construction lit, src/capture compris, et tout public/', () => {
    const inputs = [...buildInputs()];
    expect(inputs).toEqual(expect.arrayContaining(['src/capture/api-contract.ts']));
    for (const file of [...inputs, ...tracked('extension/public')]) {
      expect(included(file), file).toBe(true);
    }
  });

  it('ne prend dans le code que ce que la construction lit : ni le reste de src/capture, ni les aides des tests', () => {
    const inputs = buildInputs();
    const extra = tracked(
      'extension/assets',
      'extension/entrypoints',
      'extension/lib',
      'src/capture',
    )
      .filter(included)
      .filter((file) => !inputs.has(file));
    expect(extra).toEqual([]);
  });

  it('laisse dehors un fichier oublié à côté du code (réponse enregistrée, note, clé, paquet)', () => {
    for (const file of [
      'extension/lib/parsers/reponse-capturee.json',
      'extension/lib/parsers/reponse-capturee.sse',
      'extension/notes/a-faire.md',
      'extension/cle-faux.pem',
      'extension/web-ext-artifacts/leon-0.9.0.xpi',
      'extension/web-ext-config.mjs',
      'extension/stats.html',
      'src/capture/conversation-dump.json',
      'src/capture/brouillons/conversation-exportee.ts',
    ]) {
      expect(included(file), file).toBe(false);
    }
  });
});
