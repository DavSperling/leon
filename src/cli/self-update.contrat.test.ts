// Contrat des mises à jour automatiques (S12 du plan « CLI sans clone ») avec les vrais processus : le fichier construit
// par `pnpm build:cli`, lancé comme le fera le lanceur (`runtime/actuel/node cli/actuelle/leon.mjs`), contre un vrai
// serveur HTTP local. Les tests unitaires (self-update.test.ts) voient les fonctions avec un faux `fetch` ; ceux-ci
// gardent ce qu'ils ne voient pas : la mise à jour est vraiment détachée (le crochet rend la main sans l'attendre,
// même quand le serveur de mise à jour est lent), `--background` ne dit rien, le téléchargement passe par un vrai
// `fetch`, et la forme clone ne lance rien. Tout se passe dans un HOME temporaire : jamais le vrai ~/.leon. Le test
// ouvre un port : hors de la sandbox.
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API_PATHS } from '../capture/api-contract';
import { writeConnection } from './connection';
import { writeConsent } from './consent';
import { singleQuote } from './hook-commands';
import { launcherScript } from './launcher';
import { readMaj } from './self-update';

const run = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BUILD_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 60_000;
const SLOW_MS = 2500; // la lenteur du serveur de mise à jour : le crochet doit rendre la main bien avant
const TOKEN = `leon_${'z'.repeat(43)}`;
const SESSION = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const BLOCK = 'Bloc de démarrage de test';
const V_NEW = 'b'.repeat(12);

type Manifest = {
  version: string;
  sha256: string;
  taille: number;
  node: { version: string; plateformes: Record<string, string> };
};
type Outcome = { code: number | null; stdout: string; stderr: string; ms: number };

let dir: string;
let home: string;
let leon: string;
let manifest: Manifest; // celui de la vraie construction
let builtFile: string;

// Le faux serveur de Leon : le bloc de démarrage, le manifeste K7 (que `served` remplace) et ses fichiers.
let server: Server;
let origin: string;
let hits: string[];
let versionDelayMs: number;
let served: { manifest: unknown; files: Record<string, Buffer> } | 'broken';

const sha256 = (content: Buffer | string) => createHash('sha256').update(content).digest('hex');
const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(condition: () => Promise<boolean>, what: string) {
  for (let i = 0; i < 200; i++) {
    if (await condition()) return;
    await sleep(50);
  }
  throw new Error(`timeout: ${what}`);
}
// La mise à jour de fond a fini : maj.json est écrit et le verrou est rendu.
const backgroundDone = () =>
  waitUntil(
    async () => (await exists(join(leon, 'maj.json'))) && !(await exists(join(leon, 'maj.lock'))),
    'the background update to finish',
  );

function start(): Promise<void> {
  server = createServer((req, res) => {
    const url = req.url ?? '';
    hits.push(`${req.method} ${url}`);
    req.resume();
    const reply = (status: number, body: Buffer | string, type = 'application/json') => {
      res.writeHead(status, { 'Content-Type': type });
      res.end(body);
    };
    if (url === API_PATHS.contexte) return reply(200, JSON.stringify({ texte: BLOCK }));
    if (url === '/cli/version.json') {
      setTimeout(() => {
        if (served === 'broken') return reply(500, '{}');
        reply(200, JSON.stringify(served.manifest));
      }, versionDelayMs);
      return;
    }
    const file = served === 'broken' ? undefined : served.files[url];
    if (file) return reply(200, file, 'application/octet-stream');
    reply(404, '{}');
  });
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      done();
    });
  });
}

// Un `node` posé : `--version` donne la version du manifeste, le reste est joué par le vrai Node de la machine.
const nodeScript = (version: string) =>
  `#!/bin/sh\nif [ "$1" = --version ]; then echo v${version}; else exec ${singleQuote(process.execPath)} "$@"; fi\n`;

// ~/.leon comme `curl | sh` le laisse, avec la CLI construite en version en cours.
async function install() {
  await writeConnection(home, {
    url: origin,
    jeton: TOKEN,
    ordinateur: 'MacBook-Pro',
    espace: 'Acme',
    cree_le: '2026-11-03T10:00:00.000Z',
  });
  const nodeDir = join(leon, 'runtime', `node-v${manifest.node.version}`);
  await mkdir(nodeDir, { recursive: true });
  await writeFile(join(nodeDir, 'node'), nodeScript(manifest.node.version), { mode: 0o755 });
  await symlink(`node-v${manifest.node.version}`, join(leon, 'runtime', 'actuel'));
  await mkdir(join(leon, 'cli', manifest.version), { recursive: true });
  await cp(builtFile, join(leon, 'cli', manifest.version, 'leon.mjs'));
  await symlink(manifest.version, join(leon, 'cli', 'actuelle'));
  await mkdir(join(leon, 'bin'));
  await writeFile(join(leon, 'bin', 'leon'), launcherScript(home, { kind: 'installee' }), {
    mode: 0o700,
  });
  await writeConsent(home, 'claude_code', 2);
}

// Le serveur annonce la CLI `manifest` elle-même (rien à mettre à jour), ou une autre version, un script minuscule.
function serveCurrent() {
  served = { manifest, files: {} };
}
const NEW_CLI = Buffer.from(`if (process.argv[2] === '--version') console.log('${V_NEW}');\n`);
function serveNewVersion() {
  served = {
    manifest: { ...manifest, version: V_NEW, sha256: sha256(NEW_CLI), taille: NEW_CLI.length },
    files: { [`/cli/leon-${V_NEW}.mjs`]: NEW_CLI },
  };
}

function runChild(command: string, args: string[], input: string, cwd?: string): Promise<Outcome> {
  // Un environnement propre : ni les clés ni les réglages de l'utilisateur.
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: home,
    TMPDIR: tmpdir(),
  };
  return new Promise((done, fail) => {
    const started = performance.now();
    const child = spawn(command, args, { cwd, env: env as NodeJS.ProcessEnv });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', fail);
    // 'close' attend la fermeture des sorties : un enfant détaché qui les aurait héritées le ferait attendre ici.
    child.on('close', (code) => done({ code, stdout, stderr, ms: performance.now() - started }));
    child.stdin.end(input);
  });
}

// La CLI installée, comme le lanceur la lance.
const installed = (args: string[], input = '') =>
  runChild(
    join(leon, 'runtime', 'actuel', 'node'),
    [join(leon, 'cli', 'actuelle', 'leon.mjs'), ...args],
    input,
  );
const hook = () =>
  JSON.stringify({
    session_id: SESSION,
    hook_event_name: 'SessionStart',
    source: 'startup',
    cwd: dir,
  });
const versionRequests = () => hits.filter((hit) => hit === 'GET /cli/version.json').length;
const current = (link: string) => readlink(join(leon, link));

beforeAll(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'leon-contrat-maj-')));
  const out = join(dir, 'build');
  await run('pnpm', ['-s', 'build:cli', '--outDir', out, '--emptyOutDir'], { cwd: REPO_ROOT });
  manifest = JSON.parse(await readFile(join(out, 'version.json'), 'utf8'));
  builtFile = join(out, `leon-${manifest.version}.mjs`);
  await start();
}, BUILD_TIMEOUT_MS);

afterAll(async () => {
  await new Promise((done) => server.close(done));
  await rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  home = join(dir, `home-${Math.random().toString(36).slice(2)}`);
  leon = join(home, '.leon');
  await mkdir(home, { recursive: true });
  hits = [];
  versionDelayMs = 0;
  serveCurrent();
});
afterEach(() => rm(home, { recursive: true, force: true }));

describe('leon briefing installé', () => {
  it(
    'rend la main sans attendre la mise à jour, qui continue détachée, puis ne la relance pas avant 24 h',
    async () => {
      await install();
      versionDelayMs = SLOW_MS;

      const outcome = await installed(['briefing'], hook());

      expect(outcome.code).toBe(0);
      expect(outcome.stdout).toContain(BLOCK);
      expect(outcome.stderr).toBe('');
      expect(outcome.ms).toBeLessThan(SLOW_MS - 500);
      // La mise à jour de fond, elle, va jusqu'au bout : le manifeste réel est lu, c'est la même version.
      await backgroundDone();
      expect(versionRequests()).toBe(1);
      const checked = (await readMaj(home)).verifie_le;
      expect(checked && Date.now() - checked.getTime()).toBeLessThan(60_000);
      expect(await current('cli/actuelle')).toBe(manifest.version);

      const again = await installed(['briefing'], hook());

      expect(again.stdout).toContain(BLOCK);
      await sleep(1000); // le temps qu'un processus détaché eût lancé sa requête
      expect(versionRequests()).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'avec un maj.json de plus de 24 h, la relance',
    async () => {
      await install();
      await writeFile(
        join(leon, 'maj.json'),
        JSON.stringify({ verifie_le: new Date(Date.now() - 25 * 3_600_000).toISOString() }),
      );

      await installed(['briefing'], hook());

      await waitUntil(async () => versionRequests() === 1, 'the update to ask for the version');
      await backgroundDone();
      const checked = (await readMaj(home)).verifie_le;
      expect(checked && Date.now() - checked.getTime()).toBeLessThan(60_000);
    },
    TEST_TIMEOUT_MS,
  );
});

describe('leon update installé', () => {
  it(
    'installe la version annoncée par HTTP, la vérifie, puis --previous revient en arrière',
    async () => {
      await install();
      serveNewVersion();

      const updated = await installed(['update']);

      expect(updated.code).toBe(0);
      expect(updated.stdout).toContain(`Updated Leon to version ${V_NEW}`);
      expect(updated.stdout).toContain('To go back: ~/.leon/bin/leon update --previous');
      expect(updated.stderr).toBe('');
      expect(await current('cli/actuelle')).toBe(V_NEW);
      expect((await installed(['--version'])).stdout.trim()).toBe(V_NEW);
      expect(await readFile(join(leon, 'cli', V_NEW, 'leon.mjs'))).toEqual(NEW_CLI);
      expect((await readMaj(home)).precedente).toBe(manifest.version);

      // La CLI qui tourne maintenant est le faux script : le retour se lance avec la CLI construite.
      const back = await runChild(
        join(leon, 'runtime', 'actuel', 'node'),
        [join(leon, 'cli', manifest.version, 'leon.mjs'), 'update', '--previous'],
        '',
      );

      expect(back.code).toBe(0);
      expect(back.stdout).toContain(
        `Went back to the previous version of Leon (${manifest.version})`,
      );
      expect(await current('cli/actuelle')).toBe(manifest.version);
      expect((await installed(['--version'])).stdout.trim()).toBe(manifest.version);
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    ['une mise à jour réussie', serveNewVersion, () => V_NEW],
    [
      'un serveur en panne',
      () => {
        served = 'broken';
      },
      () => manifest.version,
    ],
  ] as const)(
    '--background ne dit rien, ni sur la sortie standard ni sur la sortie d’erreur : %s',
    async (_name, serve, expectedLink) => {
      await install();
      serve();

      const outcome = await installed(['update', '--background']);

      expect(outcome.stdout).toBe('');
      expect(outcome.stderr).toBe('');
      expect(await current('cli/actuelle')).toBe(expectedLink());
      expect(await exists(join(leon, 'maj.lock'))).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );
});

describe('leon update sans connexion', () => {
  // L'adresse de mise à jour est celle de connexion.json seule : jamais LEON_URL (le serveur d'essai d'un développeur).
  it(
    '--background sort 0 sans rien dire ni rien écrire ; à la main, le dit et sort non nul ; aucune requête',
    async () => {
      await install();
      serveNewVersion();
      await rm(join(leon, 'connexion.json'));

      const background = await installed(['update', '--background']);
      const manual = await installed(['update']);

      expect(background).toMatchObject({ code: 0, stdout: '', stderr: '' });
      expect(manual.code).toBe(1);
      expect(manual.stdout).toBe('');
      expect(manual.stderr).toBe(
        'Leon: this computer is not connected: run `~/.leon/bin/leon login`.\n',
      );
      expect(hits).toEqual([]);
      expect(await current('cli/actuelle')).toBe(manifest.version);
      expect(await exists(join(leon, 'maj.json'))).toBe(false);
      expect(await exists(join(leon, 'maj.lock'))).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );
});

describe('sous la forme clone', () => {
  const clone = (args: string[], input = '') =>
    runChild(process.execPath, ['--import', 'tsx', 'src/cli/leon.ts', ...args], input, REPO_ROOT);

  it(
    'briefing ne lance aucune mise à jour, et update refuse sans rien écrire',
    async () => {
      await mkdir(leon, { recursive: true });
      await writeConnection(home, {
        url: origin,
        jeton: TOKEN,
        ordinateur: 'MacBook-Pro',
        espace: 'Acme',
        cree_le: '2026-11-03T10:00:00.000Z',
      });
      await writeConsent(home, 'claude_code', 2);

      const briefing = await clone(['briefing'], hook());
      await sleep(1000);
      const refused = await clone(['update']);

      expect(briefing.code).toBe(0);
      expect(briefing.stdout).toContain(BLOCK);
      expect(versionRequests()).toBe(0);
      expect(refused.code).toBe(1);
      expect(refused.stderr).toContain('clone');
      expect(refused.stdout).toBe('');
      expect(await exists(join(leon, 'maj.json'))).toBe(false);
      expect(await exists(join(leon, 'cli'))).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );
});
