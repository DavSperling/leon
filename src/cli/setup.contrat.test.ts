// Contrat de la commande `leon setup` avec le vrai processus (le même que le script `leon` de package.json, sans pnpm) :
// l'analyse des options, les questions posées sur l'entrée standard, les dépendances que leon.ts donne à setup.ts. Tout
// se passe dans un HOME et un CLAUDE_CONFIG_DIR temporaires : jamais le vrai ~/.claude ni le vrai ~/.leon. L'ordinateur
// y est « connecté » par LEON_URL et LEON_TOKEN (E5), vers le port 1 qui refuse toute connexion : `leon login` n'est
// jamais lancé, aucun navigateur ne s'ouvre et aucun appel réseau n'est fait.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { launcherHookCommand, launcherPath } from './hook-commands';
import { SETTINGS_FILE } from './install-hooks';
import { launcherScript } from './launcher';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TEST_TIMEOUT_MS = 60_000;
const FAKE_TOKEN = `leon_${'z'.repeat(43)}`;

let dir: string;
let home: string;
let configDir: string;
let clone: string;

type Outcome = { code: number | null; stdout: string; stderr: string };

function leon(args: string[], input = '', env: Record<string, string> = {}): Promise<Outcome> {
  // Un environnement propre : ni les clés ni les réglages de l'utilisateur.
  const childEnv: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: home,
    TMPDIR: tmpdir(),
    CLAUDE_CONFIG_DIR: configDir,
    LEON_URL: 'http://127.0.0.1:1',
    LEON_TOKEN: FAKE_TOKEN,
    ...env,
  };
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli/leon.ts', ...args], {
      cwd: REPO_ROOT,
      env: childEnv as NodeJS.ProcessEnv,
    });
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

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

beforeAll(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'leon-contrat-setup-')));
  home = join(dir, 'home');
  configDir = join(dir, 'claude');
  clone = join(dir, "l'équipe de leon");
  await mkdir(join(clone, 'src', 'cli'), { recursive: true });
  await writeFile(join(clone, 'src', 'cli', 'leon.ts'), '');
}, TEST_TIMEOUT_MS);

beforeEach(async () => {
  await rm(home, { recursive: true, force: true });
  await rm(configDir, { recursive: true, force: true });
  await mkdir(home, { recursive: true });
  await mkdir(configDir, { recursive: true });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('leon setup', () => {
  it(
    '--depot et --yes : écrit le lanceur de la forme clone, les crochets du lanceur et l’accord, puis ne change plus rien',
    async () => {
      const first = await leon(['setup', '--depot', clone, '--yes']);
      const settings = await readFile(join(configDir, SETTINGS_FILE), 'utf8');
      const launcher = await readFile(launcherPath(home), 'utf8');
      const consent = await readFile(join(home, '.leon', 'accord.json'), 'utf8');
      const second = await leon(['setup', '--depot', clone, '--yes']);

      expect(first.code).toBe(0);
      expect(first.stdout).toContain('Claude Code: hooks installed');
      expect(first.stdout).toContain('To run Leon later: ~/.leon/bin/leon <command>');
      expect(launcher).toBe(launcherScript(home, { kind: 'clone', repoDir: clone }));
      const { hooks } = JSON.parse(settings);
      expect(hooks.SessionStart[0].hooks[0].command).toBe(launcherHookCommand(home, 'briefing'));
      expect(hooks.SessionEnd[0].hooks[0].command).toBe(
        launcherHookCommand(home, 'capter-session'),
      );
      expect(JSON.parse(consent).outils.claude_code.version).toBe(2);
      expect(first.stdout + first.stderr).not.toContain(FAKE_TOKEN);

      expect(second.code).toBe(0);
      expect(second.stdout).toContain('Launcher already in place');
      expect(await readFile(join(configDir, SETTINGS_FILE), 'utf8')).toBe(settings);
      expect(await readFile(launcherPath(home), 'utf8')).toBe(launcher);
      expect(await readFile(join(home, '.leon', 'accord.json'), 'utf8')).toBe(consent);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'sans --yes, lit la réponse sur l’entrée standard : « y » installe, « n » et l’entrée fermée n’écrivent rien',
    async () => {
      const refused = await leon(['setup', '--depot', clone], 'n\n');
      const closed = await leon(['setup', '--depot', clone], '');
      expect(refused.code).toBe(0);
      expect(refused.stdout).toContain('[y/N]');
      expect(refused.stdout).toContain('Claude Code: skipped');
      expect(closed.stdout).toContain('Claude Code: skipped');
      expect(await exists(join(configDir, SETTINGS_FILE))).toBe(false);
      expect(await exists(join(home, '.leon', 'accord.json'))).toBe(false);

      const accepted = await leon(['setup', '--depot', clone], 'y\n');

      expect(accepted.code).toBe(0);
      expect(accepted.stdout).toContain('Claude Code: hooks installed');
      expect(await exists(join(configDir, SETTINGS_FILE))).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'une copie de Leon qui n’est pas installée dans ~/.leon : refuse la forme installée, sans rien écrire',
    async () => {
      const outcome = await leon(['setup', '--yes']);

      expect(outcome.code).toBe(1);
      expect(outcome.stderr).toContain('--depot');
      expect(outcome.stdout).toBe('');
      expect(await exists(join(home, '.leon'))).toBe(false);
      expect(await exists(join(configDir, SETTINGS_FILE))).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'refuse un --depot qui n’est pas un dépôt de Leon et une option inconnue, sans rien écrire',
    async () => {
      const wrong = await leon(['setup', '--yes', '--depot', dir]);
      const unknown = await leon(['setup', '--yes', '--partout']);

      for (const outcome of [wrong, unknown]) {
        expect(outcome.code).toBe(1);
        expect(outcome.stdout).toBe('');
      }
      expect(wrong.stderr).toContain('Leon repository');
      expect(await exists(join(home, '.leon'))).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'l’aide dit la commande, ses trois options, et un usage juste sous les deux formes',
    async () => {
      const { stdout } = await leon(['help']);

      expect(stdout).toContain('Usage: leon <command>');
      expect(stdout).toContain('~/.leon/bin/leon <command>');
      expect(stdout).toContain('pnpm leon <command>');
      expect(stdout).not.toContain('Usage: pnpm leon');
      expect(stdout).toMatch(/^ {2}setup /m);
      for (const option of ['--url', '--depot', '--yes']) expect(stdout).toContain(option);
    },
    TEST_TIMEOUT_MS,
  );
});
