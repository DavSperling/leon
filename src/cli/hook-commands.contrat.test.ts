// Contrat de la ligne pnpm des crochets (hook-commands.ts) avec le vrai pnpm, dans un petit dépôt jetable dont
// node_modules ne correspond plus à package.json (comme le clone principal après un `git pull` qui change le
// verrou). La ligne doit : n'écrire sur la sortie standard que ce qu'écrit le script (SessionStart l'ajoute au
// contexte de la session), ne rien installer, transmettre l'entrée standard (le JSON du crochet) et poser INIT_CWD
// au dossier d'où elle est lancée (briefing.ts en tire le projet). Aucun réseau : la seule dépendance est un dossier
// local (`file:`), le magasin de pnpm est dans le dossier temporaire.
//
// Et la CLI de Leon : `leon` connaît bien les deux sous-commandes que lancent les crochets.
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hookCommand } from './hook-commands';

const run = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TEST_TIMEOUT_MS = 60_000;
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
