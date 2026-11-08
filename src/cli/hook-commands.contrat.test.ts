// Contrat de la ligne pnpm des crochets (hook-commands.ts) avec le vrai pnpm, dans un petit dépôt jetable dont
// node_modules ne correspond plus à package.json (comme le clone principal après un `git pull` qui change le
// verrou). La ligne doit : n'écrire sur la sortie standard que ce qu'écrit le script (SessionStart l'ajoute au
// contexte de la session), ne rien installer, transmettre l'entrée standard (le JSON du crochet) et poser INIT_CWD
// au dossier d'où elle est lancée (briefing.ts en tire le projet). Aucun réseau : la seule dépendance est un dossier
// local (`file:`), le magasin de pnpm est dans le dossier temporaire.
//
// Et la CLI de Leon : `leon` connaît bien les deux sous-commandes que lancent les crochets.
//
// Puis le vrai lanceur ~/.leon/bin/leon (launcher.ts, K8), écrit dans un dossier personnel qui a une espace et une
// apostrophe, et lancé par `sh -c` comme Claude Code lance la commande d'un crochet (launcherHookCommand, K9) : sous
// ses deux formes, il rend `leon --version`, et la forme clone garde les propriétés de la ligne pnpm ci-dessus.
import { execFile, spawn } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  hookCommand,
  launcherHookCommand,
  launcherPath,
  shellQuote,
  singleQuote,
} from './hook-commands';
import { writeLauncher } from './launcher';
import runtime from './runtime.json';

const run = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TEST_TIMEOUT_MS = 60_000;
const BUILD_TIMEOUT_MS = 120_000;
const HOOK_JSON = '{"cwd":"/projets/client","hook_event_name":"SessionStart"}';

// Le script `leon` du dépôt jetable : il recopie sa sous-commande, l'entrée standard et INIT_CWD.
const LEON_SCRIPT = `let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  console.log(['point', process.argv[2], input, process.env.INIT_CWD].join('|'));
});
`;

let dir: string;
let app: string;
let project: string;
// Un environnement propre : rien de celui du test (Vitest lancé par pnpm y met ses propres npm_config_*).
let env: NodeJS.ProcessEnv;

type Outcome = { code: number | null; stdout: string; stderr: string };

function cleanEnv(home: string): NodeJS.ProcessEnv {
  const kept: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: home,
    TMPDIR: tmpdir(),
  };
  return kept as NodeJS.ProcessEnv;
}

function runShell(command: string, cwd: string, input: string): Promise<Outcome> {
  return new Promise((done, fail) => {
    const child = spawn('/bin/sh', ['-c', command], { cwd, env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', fail);
    child.on('close', (code) => done({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

// Les paquets installés (sans les fichiers de pnpm, qui commencent par un point).
const installed = async () =>
  (await readdir(join(app, 'node_modules'))).filter((name) => !name.startsWith('.')).sort();

beforeAll(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'leon-contrat-pnpm-')));
  const dep = join(dir, 'dep');
  app = join(dir, 'leon');
  project = join(dir, 'projet');
  const home = join(dir, 'home');
  await Promise.all([dep, app, project, home].map((path) => mkdir(path, { recursive: true })));
  env = cleanEnv(home);
  await writeFile(
    join(dep, 'package.json'),
    JSON.stringify({ name: 'dep-local', version: '1.0.0' }),
  );
  await writeFile(join(app, 'leon.js'), LEON_SCRIPT);
  await writeFile(join(app, 'pnpm-workspace.yaml'), `storeDir: ${join(dir, 'store')}\n`);
  const manifest = {
    name: 'leon-jetable',
    version: '1.0.0',
    private: true,
    scripts: { leon: 'node leon.js' },
    dependencies: { 'dep-local': 'file:../dep' } as Record<string, string>,
  };
  await writeFile(join(app, 'package.json'), JSON.stringify(manifest));
  await run('pnpm', ['install', '--offline', '--silent'], { cwd: app, env });
  // node_modules ne correspond plus à package.json : une dépendance ajoutée, jamais installée.
  manifest.dependencies['dep-bis'] = 'file:../dep';
  await writeFile(join(app, 'package.json'), JSON.stringify(manifest));
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('la ligne pnpm des crochets', () => {
  it(
    'sur des dépendances périmées : seule la sortie du script, rien d’installé, entrée et INIT_CWD transmis',
    async () => {
      const before = await installed();
      const lockfile = await readFile(join(app, 'pnpm-lock.yaml'), 'utf8');

      const outcome = await runShell(hookCommand(app, 'briefing'), project, HOOK_JSON);

      expect(outcome.code).toBe(0);
      expect(outcome.stdout).toBe(`point|briefing|${HOOK_JSON}|${project}\n`);
      expect(await installed()).toEqual(before);
      expect(before).toEqual(['dep-local']);
      expect(await readFile(join(app, 'pnpm-lock.yaml'), 'utf8')).toBe(lockfile);
    },
    TEST_TIMEOUT_MS,
  );

  // Le témoin : sans l'option, pnpm installe avant le script et le dit sur la sortie standard. Si ce test échoue
  // un jour parce que pnpm a cessé de le faire, l'option n'est plus utile, mais reste sans danger.
  it(
    'sans l’option, pnpm installerait d’abord et l’écrirait sur la sortie standard',
    async () => {
      const outcome = await runShell(`pnpm -s --dir ${app} leon briefing`, project, HOOK_JSON);

      expect(outcome.stdout).not.toBe(`point|briefing|${HOOK_JSON}|${project}\n`);
      expect(await installed()).toContain('dep-bis');
    },
    TEST_TIMEOUT_MS,
  );
});

describe('la CLI de Leon', () => {
  it(
    'connaît les deux sous-commandes lancées par les crochets',
    async () => {
      const { stdout } = await run(
        process.execPath,
        ['--import', 'tsx', 'src/cli/leon.ts', 'help'],
        {
          cwd: REPO_ROOT,
          env: cleanEnv(tmpdir()),
        },
      );

      expect(stdout).toMatch(/^ {2}briefing /m);
      expect(stdout).toMatch(/^ {2}capter-session /m);
    },
    TEST_TIMEOUT_MS,
  );
});

describe('le lanceur réel', () => {
  let launcherHome: string;
  let cliVersion: string;

  // Un Node « quelconque du poste » à la place de celui que Leon pose (un script qui lance celui du test), et la vraie
  // CLI construite par `pnpm build:cli`, rangés là où le lanceur les cherche (K1 : runtime/node-v<version>/node et le
  // lien runtime/actuel, cli/<version>/leon.mjs et le lien cli/actuelle).
  beforeAll(async () => {
    launcherHome = join(dir, "Léa O'Neil");
    const built = join(dir, 'cli-construite');
    await run('pnpm', ['-s', 'build:cli', '--outDir', built, '--emptyOutDir'], { cwd: REPO_ROOT });
    cliVersion = JSON.parse(await readFile(join(built, 'version.json'), 'utf8')).version;
    const cliDir = join(launcherHome, '.leon', 'cli', cliVersion);
    await mkdir(cliDir, { recursive: true });
    await copyFile(join(built, `leon-${cliVersion}.mjs`), join(cliDir, 'leon.mjs'));
    await symlink(cliVersion, join(launcherHome, '.leon', 'cli', 'actuelle'));
    await installNode(`node-v${runtime.version}`, `exec ${singleQuote(process.execPath)} "$@"`);
    await symlink(`node-v${runtime.version}`, join(runtimeDir(), 'actuel'));
  }, BUILD_TIMEOUT_MS);

  const runtimeDir = () => join(launcherHome, '.leon', 'runtime');
  // Un « Node » : le script `body` dans runtime/<name>/node.
  async function installNode(name: string, body: string): Promise<void> {
    const node = join(runtimeDir(), name, 'node');
    await mkdir(dirname(node), { recursive: true });
    await writeFile(node, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  }

  // Un crochet de Claude Code est une commande de shell : le lanceur, puis ses arguments.
  const hookLine = (args: string) => `${shellQuote(launcherPath(launcherHome))} ${args}`;

  it(
    'forme installée : le Node posé et la CLI construite rendent leur version',
    async () => {
      await writeLauncher(launcherHome, { kind: 'installee' }, () => true);

      const outcome = await runShell(hookLine('--version'), project, '');

      expect(outcome).toEqual({ code: 0, stdout: `${cliVersion}\n`, stderr: '' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'forme clone : pnpm dans le clone rend « dev », la version du TypeScript lancé tel quel',
    async () => {
      await writeLauncher(launcherHome, { kind: 'clone', repoDir: REPO_ROOT }, () => true);

      const outcome = await runShell(hookLine('--version'), project, '');

      // Un clone sans .env.local (la CI, un worktree neuf) : Node le signale sur stderr, et rien d'autre ne doit y être.
      const stderr = outcome.stderr.replace(
        /^\.env\.local not found\. Continuing without it\.\n/,
        '',
      );
      expect({ ...outcome, stderr }).toEqual({ code: 0, stdout: 'dev\n', stderr: '' });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'forme clone, la commande du crochet sur des dépendances périmées : seule la sortie du script, rien d’installé, entrée et INIT_CWD transmis',
    async () => {
      await writeLauncher(launcherHome, { kind: 'clone', repoDir: app }, () => true);
      const manifest = JSON.parse(await readFile(join(app, 'package.json'), 'utf8'));
      manifest.dependencies['dep-ter'] = 'file:../dep'; // une dépendance de plus, jamais installée
      await writeFile(join(app, 'package.json'), JSON.stringify(manifest));
      const before = await installed();

      const outcome = await runShell(
        launcherHookCommand(launcherHome, 'briefing'),
        project,
        HOOK_JSON,
      );

      expect(outcome.code).toBe(0);
      expect(outcome.stdout).toBe(`point|briefing|${HOOK_JSON}|${project}\n`);
      expect(await installed()).toEqual(before);
      expect(before).not.toContain('dep-ter');
    },
    TEST_TIMEOUT_MS,
  );

  // Une mise à jour de Node (S12) change le lien runtime/actuel d'un coup, sans toucher au lanceur.
  it(
    'forme installée : le lien runtime/actuel change, le lanceur reste le même et lance le nouveau Node',
    async () => {
      await writeLauncher(launcherHome, { kind: 'installee' }, () => true);
      const before = await readFile(launcherPath(launcherHome), 'utf8');
      await installNode('node-v99.0.0', 'echo node-suivant');
      await symlink('node-v99.0.0', join(runtimeDir(), 'actuel.neuf'));
      await rename(join(runtimeDir(), 'actuel.neuf'), join(runtimeDir(), 'actuel'));

      const outcome = await runShell(hookLine('--version'), project, '');

      expect(outcome).toEqual({ code: 0, stdout: 'node-suivant\n', stderr: '' });
      expect((await writeLauncher(launcherHome, { kind: 'installee' })).etat).toBe('identique');
      expect(await readFile(launcherPath(launcherHome), 'utf8')).toBe(before);
    },
    TEST_TIMEOUT_MS,
  );
});
