// Contrat de la commande `leon setup` avec le vrai processus (le même que le script `leon` de package.json, sans pnpm) :
// l'analyse des options, les questions posées sur l'entrée standard, les dépendances que leon.ts donne à setup.ts. Tout
// se passe dans un HOME et un CLAUDE_CONFIG_DIR temporaires : jamais le vrai ~/.claude ni le vrai ~/.leon. L'ordinateur
// y est « connecté » par ~/.leon/connexion.json (K2) vers le port 1, qui refuse toute connexion : `setup` ne peut pas
// contrôler le jeton et compte l'ordinateur pour connecté, donc `leon login` n'est jamais lancé et aucun navigateur ne
// s'ouvre. Le test du jeton révoqué, lui, parle à un vrai faux serveur local, et son `open` est un faux.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { writeConnection } from './connection';
import { factsConsent } from './consent';
import { hookCommand, launcherHookCommand, launcherPath } from './hook-commands';
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

// L'ordinateur est connecté (K2) à un serveur qui ne répond pas : `setup` ne contrôle rien et ne relance pas `login`.
const connect = () =>
  writeConnection(home, {
    url: 'http://127.0.0.1:1',
    jeton: FAKE_TOKEN,
    ordinateur: 'MacBook-Pro',
    espace: 'Acme',
    cree_le: '2026-11-03T10:00:00.000Z',
  });

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
      await connect();
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
      await connect();
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

  // La porte de D30 (`interactive: process.stdin.isTTY === true`, leon.ts) : une réponse lue d'un tube peut venir d'un
  // agent. Le « y » d'après l'accord de base n'est donc jamais lu comme un usage, ni la question posée.
  it(
    'sur « y » puis « y » par un tube : l’accord de base seul, ni usage ni refus, et l’usage resume n’est pas montré',
    async () => {
      await connect();

      const outcome = await leon(['setup', '--depot', clone], 'y\ny\n');

      expect(outcome.code).toBe(0);
      expect(outcome.stdout).toContain('Claude Code: hooks installed');
      expect(outcome.stdout).not.toContain('usage "resume"');
      expect((await factsConsent(home, 'claude_code'))?.usages).toEqual([]);
      expect(
        JSON.parse(await readFile(join(home, '.leon', 'accord.json'), 'utf8')).outils.claude_code,
      ).toEqual({ version: 2, installe_le: expect.any(String) });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'une copie de Leon qui n’est pas installée dans ~/.leon : refuse la forme installée, sans rien écrire',
    async () => {
      const outcome = await leon(['setup', '--yes']);

      expect(outcome.code).toBe(1);
      expect(outcome.stderr).toContain('--depot');
      // La garde cite la commande d'installation, avec l'adresse du serveur connue (ici LEON_URL).
      expect(outcome.stderr).toContain('`curl -fsSL http://127.0.0.1:1/install | sh`');
      expect(outcome.stdout).toBe('');
      expect(await exists(join(home, '.leon'))).toBe(false);
      expect(await exists(join(configDir, SETTINGS_FILE))).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  // Une installation d'avant le lanceur : le Node et la CLI sont posés (le script d'installation), les réglages portent les
  // crochets `pnpm … --dir <clone> leon …` avec un crochet de l'utilisateur entre eux, l'accord est en version 2.
  it(
    'migre les crochets pnpm d’avant vers le lanceur, garde l’accord, dit le clone d’avant, puis ne change plus rien',
    async () => {
      const oldClone = join(dir, 'ancien-clone');
      await connect();
      await mkdir(oldClone, { recursive: true });
      await writeFile(join(oldClone, '.env.local'), `LEON_TOKEN=${FAKE_TOKEN}\n`);
      await mkdir(join(home, '.leon', 'runtime', 'actuel'), { recursive: true });
      await writeFile(join(home, '.leon', 'runtime', 'actuel', 'node'), '');
      await mkdir(join(home, '.leon', 'cli', 'actuelle'), { recursive: true });
      await writeFile(join(home, '.leon', 'cli', 'actuelle', 'leon.mjs'), '');
      const consent = `${JSON.stringify({ outils: { claude_code: { version: 2, installe_le: '2026-10-20T08:00:00.000Z' } } }, null, 2)}\n`;
      await writeFile(join(home, '.leon', 'accord.json'), consent);
      const yours = { type: 'command', command: 'echo à moi' };
      await writeFile(
        join(configDir, SETTINGS_FILE),
        JSON.stringify({
          hooks: {
            SessionStart: [
              {
                hooks: [
                  { type: 'command', command: hookCommand(oldClone, 'briefing'), timeout: 10 },
                ],
              },
            ],
            PreToolUse: [{ hooks: [yours] }],
            SessionEnd: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: hookCommand(oldClone, 'capter-session'),
                    timeout: 30,
                  },
                ],
              },
            ],
          },
        }),
      );

      const first = await leon(['setup'], 'y\n');
      const settings = await readFile(join(configDir, SETTINGS_FILE), 'utf8');
      const second = await leon(['setup']);

      expect(first.code).toBe(0);
      expect(first.stdout).toContain('already connected to Leon (http://127.0.0.1:1).');
      expect(first.stdout).toContain(
        `Your hooks used to run Leon from ${oldClone}; they now run ~/.leon/bin/leon. The token in ${oldClone}/.env.local is no longer needed: revoke it in Settings › Personal tokens.`,
      );
      const { hooks } = JSON.parse(settings);
      expect(hooks.SessionStart[0].hooks[0]).toEqual({
        type: 'command',
        command: launcherHookCommand(home, 'briefing'),
        timeout: 10,
      });
      expect(hooks.PreToolUse).toEqual([{ hooks: [yours] }]);
      expect(hooks.SessionEnd[0].hooks[0]).toEqual({
        type: 'command',
        command: launcherHookCommand(home, 'capter-session'),
        timeout: 30,
      });
      expect(settings).not.toContain('pnpm');
      expect(await readFile(join(home, '.leon', 'accord.json'), 'utf8')).toBe(consent);
      expect(first.stdout + first.stderr).not.toContain(FAKE_TOKEN);

      expect(second.code).toBe(0);
      expect(second.stdout).not.toContain('used to run Leon');
      expect(await readFile(join(configDir, SETTINGS_FILE), 'utf8')).toBe(settings);
    },
    TEST_TIMEOUT_MS,
  );

  // Un jeton révoqué : un vrai serveur local répond 401 à /api/v1/me, `setup` le dit et relance `leon login`. Le navigateur
  // de `login` est un faux `open` qui renvoie aussitôt « refus » (K3) : la commande s'arrête là, sans rien d'ouvert.
  it(
    'un jeton révoqué : le dit et relance la connexion par le navigateur, sans poser de crochet',
    async () => {
      const authorizations: Array<string | undefined> = [];
      const server = createServer((request, response) => {
        if (request.url === '/api/v1/me') authorizations.push(request.headers.authorization);
        response.writeHead(request.url === '/api/v1/me' ? 401 : 404).end();
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const browser = join(dir, 'faux-navigateur');
      await mkdir(browser, { recursive: true });
      for (const name of ['open', 'xdg-open']) {
        await writeFile(
          join(browser, name),
          [
            `#!${process.execPath}`,
            'const url = new URL(process.argv[2]);',
            'const { port, etat } = Object.fromEntries(url.searchParams);',
            'fetch("http://127.0.0.1:" + port + "/retour?refus=1&etat=" + etat, { redirect: "manual" }).catch(() => {});',
            '',
          ].join('\n'),
          { mode: 0o755 },
        );
      }
      await writeConnection(home, {
        url: address,
        jeton: FAKE_TOKEN,
        ordinateur: 'MacBook-Pro',
        espace: 'Acme',
        cree_le: '2026-11-03T10:00:00.000Z',
      });

      let outcome: Outcome;
      try {
        outcome = await leon(['setup', '--depot', clone, '--yes'], '', {
          PATH: browser,
          LEON_URL: '',
          LEON_TOKEN: '',
        });
      } finally {
        server.close();
      }

      expect(authorizations).toEqual([`Bearer ${FAKE_TOKEN}`]);
      expect(outcome.stdout).toContain(
        'This computer was disconnected from Leon (its token was revoked): connecting it again.',
      );
      expect(outcome.stdout).toContain(`${address}/ordinateur/autoriser?`);
      expect(outcome.stderr).toContain('Authorization cancelled in the browser');
      expect(outcome.stderr).toContain('setup stopped');
      expect(outcome.code).toBe(1);
      expect(outcome.stdout + outcome.stderr).not.toContain(FAKE_TOKEN);
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
