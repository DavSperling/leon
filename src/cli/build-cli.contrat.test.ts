// Contrat de la CLI construite (S06 du plan « CLI sans clone ») : la vraie construction (`pnpm build:cli`, dans un
// dossier temporaire) et le vrai Node sur le fichier obtenu, comme le fera le lanceur de ~/.leon. Les tests
// unitaires voient la CLI en TypeScript, avec tout le dépôt autour ; celui-ci garde ce qu'ils ne voient pas : le
// fichier est seul (rien de src/server, ni drizzle, ni pg-boss), il démarre vite, et le manifeste dit vrai.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import runtime from './runtime.json';

const run = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BUILD_TIMEOUT_MS = 120_000;
const MAX_BYTES = 1024 * 1024;
// 150 ms visés pour un crochet (contraintes globales du plan) ; 300 ms laissent la marge d'une machine lente ou
// chargée par les autres tests.
const MAX_STARTUP_MS = 300;

type Manifest = {
  version: string;
  sha256: string;
  taille: number;
  node: { version: string; plateformes: Record<string, string> };
};

let dirs: string[] = [];
let outDir: string;
let manifest: Manifest;
let cliFile: string;

async function build(): Promise<string> {
  const out = await mkdtemp(join(tmpdir(), 'leon-build-cli-'));
  dirs.push(out);
  await run('pnpm', ['-s', 'build:cli', '--outDir', out, '--emptyOutDir'], { cwd: REPO_ROOT });
  return out;
}

const readManifest = async (dir: string): Promise<Manifest> =>
  JSON.parse(await readFile(join(dir, 'version.json'), 'utf8'));

beforeAll(async () => {
  outDir = await build();
  manifest = await readManifest(outDir);
  cliFile = join(outDir, `leon-${manifest.version}.mjs`);
}, BUILD_TIMEOUT_MS);

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

describe('pnpm build:cli', () => {
  it('écrit seulement leon-<version>.mjs et version.json', async () => {
    expect(manifest.version).toMatch(/^[0-9a-f]{12}$/);
    expect((await readdir(outDir)).sort()).toEqual([
      `leon-${manifest.version}.mjs`,
      'version.json',
    ]);
  });

  it('fait un fichier de moins de 1 Mo, dont le manifeste donne la taille et l’empreinte exactes', async () => {
    const content = await readFile(cliFile);
    expect(content.length).toBeLessThan(MAX_BYTES);
    expect(manifest.taille).toBe((await stat(cliFile)).size);
    expect(manifest.sha256).toBe(createHash('sha256').update(content).digest('hex'));
  });

  it('copie dans le manifeste le Node épinglé de runtime.json', () => {
    expect(manifest.node).toEqual({ version: runtime.version, plateformes: runtime.plateformes });
  });

  it(
    'rend la même version quand le code n’a pas changé',
    async () => {
      const again = await build();
      expect(await readManifest(again)).toEqual(manifest);
      expect(await readFile(join(again, `leon-${manifest.version}.mjs`))).toEqual(
        await readFile(cliFile),
      );
    },
    BUILD_TIMEOUT_MS,
  );

  it('ne contient rien du serveur : ni requête Drizzle, ni pg-boss, ni DATABASE_URL', async () => {
    const content = await readFile(cliFile, 'utf8');
    for (const forbidden of ['Failed query:', 'pg-boss', 'DATABASE_URL']) {
      expect(content, forbidden).not.toContain(forbidden);
    }
  });
});

describe('node leon.mjs', () => {
  it('--version rend la version du manifeste', async () => {
    const { stdout } = await run(process.execPath, [cliFile, '--version']);
    expect(stdout.trim()).toBe(manifest.version);
  });

  it(`help répond en moins de ${MAX_STARTUP_MS} ms`, async () => {
    // Le meilleur de trois lancements : un seul peut tomber sur une machine occupée par les autres tests.
    const durations: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const start = performance.now();
      const { stdout } = await run(process.execPath, [cliFile, 'help']);
      durations.push(performance.now() - start);
      expect(stdout).toContain('Commands:');
    }
    expect(Math.min(...durations)).toBeLessThan(MAX_STARTUP_MS);
  });
});

describe('leon --version sous le clone', () => {
  it('rend « dev » : la version n’est injectée que par la construction', async () => {
    const { stdout } = await run(
      process.execPath,
      ['--import', 'tsx', 'src/cli/leon.ts', '--version'],
      {
        cwd: REPO_ROOT,
      },
    );
    expect(stdout.trim()).toBe('dev');
  });
});
