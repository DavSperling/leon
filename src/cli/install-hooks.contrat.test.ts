// Contrat de la commande `leon installer-crochets` avec le vrai processus, le vrai shell et le vrai pnpm, sur un
// faux dossier de configuration de Claude Code (CLAUDE_CONFIG_DIR, et HOME vers un autre dossier temporaire : jamais
// le vrai ~/.claude) et sur un faux dépôt de Leon dont le chemin porte une espace et une apostrophe.
// Ce qu'on vérifie : la commande s'arrête sur « non » comme sur une entrée fermée, écrit avec --oui, refuse un dépôt
// qui n'en est pas un, et les commandes qu'elle écrit, lancées comme le fait Claude Code (un shell, le JSON du
// crochet sur l'entrée standard, le dossier du projet pour dossier courant), atteignent le script `leon` du dépôt
// avec le JSON intact et le dossier du projet dans INIT_CWD, d'où `leon briefing` tire le projet.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hookCommand, shellQuote } from './hook-commands';
import { BACKUP_FILE, SETTINGS_FILE } from './install-hooks';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TEST_TIMEOUT_MS = 60_000;
const START_JSON = '{"session_id":"s1","cwd":"/projets/client","hook_event_name":"SessionStart"}';
const END_JSON =
  '{"session_id":"s1","transcript_path":"/t/s1.jsonl","cwd":"/projets/client","hook_event_name":"SessionEnd","reason":"other"}';

// Le script `leon` du faux dépôt : il recopie sa sous-commande, l'entrée standard et INIT_CWD.
const LEON_SCRIPT = `let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  console.log(['point', process.argv[2], input, process.env.INIT_CWD].join('|'));
});
`;

let dir: string;
let fakeRepo: string;
let project: string;
let home: string;
let configDir: string;
let settingsPath: string;

type Outcome = { code: number | null; stdout: string; stderr: string };

// Un environnement propre : ni les clés de l'utilisateur ni ses réglages ne peuvent entrer dans l'essai.
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: home,
    TMPDIR: tmpdir(),
    ...extra,
  };
  return env as NodeJS.ProcessEnv;
}

function spawnAndWait(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; input: string },
): Promise<Outcome> {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env });
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
    child.stdin.end(options.input);
  });
}

// `pnpm leon installer-crochets …` sans pnpm : la même CLI, lancée par node comme le script `leon`.
function leon(args: string[], input = '', claudeConfigDir: string = configDir): Promise<Outcome> {
  return spawnAndWait(process.execPath, ['--import', 'tsx', 'src/cli/leon.ts', ...args], {
    cwd: REPO_ROOT,
    env: cleanEnv({ CLAUDE_CONFIG_DIR: claudeConfigDir }),
    input,
  });
}

async function seedSettings(text: string): Promise<void> {
  await mkdir(configDir, { recursive: true });
  await writeFile(settingsPath, text);
}

function runShell(command: string, input: string): Promise<Outcome> {
  return spawnAndWait('/bin/sh', ['-c', command], { cwd: project, env: cleanEnv(), input });
}

beforeAll(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'leon-contrat-crochets-')));
  fakeRepo = join(dir, "l'équipe de leon");
  project = join(dir, 'projet');
  home = join(dir, 'home');
  configDir = join(dir, 'claude');
  settingsPath = join(configDir, SETTINGS_FILE);
  await Promise.all(
    [join(fakeRepo, 'src', 'cli'), project, home].map((path) => mkdir(path, { recursive: true })),
  );
  await writeFile(join(fakeRepo, 'leon.js'), LEON_SCRIPT);
  await writeFile(join(fakeRepo, 'src', 'cli', 'leon.ts'), '');
  await writeFile(
    join(fakeRepo, 'package.json'),
    JSON.stringify({
      name: 'leon-jetable',
      version: '1.0.0',
      private: true,
      scripts: { leon: 'node leon.js' },
    }),
  );
}, TEST_TIMEOUT_MS);

beforeEach(async () => {
  await rm(configDir, { recursive: true, force: true });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('leon installer-crochets', () => {
  // Des réglages existants : la lecture du fichier prend du temps, et la réponse « non » est déjà arrivée sur
  // l'entrée standard quand la question est posée (elle ne doit pas se perdre).
  it.each([
    ['des réglages existants', true],
    ['pas de réglages', false],
  ])(
    'sur « non » ne change rien (%s) ; sur une entrée fermée non plus',
    async (_name, existing) => {
      const before = '{"theme":"dark"}\n';
      if (existing) await seedSettings(before);

      const refused = await leon(['installer-crochets', '--depot', fakeRepo], 'non\n');
      const closed = await leon(['installer-crochets', '--depot', fakeRepo], '');

      for (const outcome of [refused, closed]) {
        expect(outcome.code).toBe(0);
        expect(outcome.stdout).toContain(hookCommand(fakeRepo, 'briefing'));
        expect(outcome.stdout).toContain('[o/N]');
        expect(outcome.stdout).toContain("Rien n'a été écrit");
      }
      if (existing) {
        expect(await readFile(settingsPath, 'utf8')).toBe(before);
        expect(await readdir(configDir)).toEqual([SETTINGS_FILE]);
      } else {
        await expect(readdir(configDir)).rejects.toThrow();
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'sur « oui » écrit les crochets et garde les réglages, et un second passage ne change rien',
    async () => {
      const before = '{"theme":"dark"}\n';
      await seedSettings(before);

      const first = await leon(['installer-crochets', '--depot', fakeRepo], 'oui\n');
      const written = await readFile(settingsPath, 'utf8');
      const second = await leon(['installer-crochets', '--depot', fakeRepo, '--oui']);

      expect(first.code).toBe(0);
      expect(JSON.parse(written)).toMatchObject({
        theme: 'dark',
        hooks: { SessionStart: [{}], SessionEnd: [{}] },
      });
      expect(second.code).toBe(0);
      expect(second.stdout).toContain('déjà');
      expect(await readFile(settingsPath, 'utf8')).toBe(written);
      expect(await readFile(join(configDir, BACKUP_FILE), 'utf8')).toBe(before);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'sans --depot, cite le dépôt qui lance la commande, avec un chemin absolu',
    async () => {
      const outcome = await leon(['installer-crochets', '--oui']);

      expect(outcome.code).toBe(0);
      const { hooks } = JSON.parse(await readFile(settingsPath, 'utf8'));
      const here = resolve(REPO_ROOT);
      expect(hooks.SessionStart[0].hooks[0].command).toBe(hookCommand(here, 'briefing'));
      expect(hooks.SessionEnd[0].hooks[0].command).toBe(hookCommand(here, 'capter-session'));
      expect(here).toMatch(/^\//);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'refuse un --depot qui n’est pas un dépôt de Leon, sans rien écrire',
    async () => {
      const missing = await leon(['installer-crochets', '--oui', '--depot', join(dir, 'absent')]);
      const wrong = await leon(['installer-crochets', '--oui', '--depot', project]);

      for (const outcome of [missing, wrong]) {
        expect(outcome.code).toBe(1);
        expect(outcome.stderr).toContain('dépôt de Leon');
        expect(outcome.stdout).toBe('');
      }
      await expect(readdir(configDir)).rejects.toThrow();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'refuse un CLAUDE_CONFIG_DIR relatif, que Claude Code et la commande ne liraient pas depuis le même dossier',
    async () => {
      const outcome = await leon(['installer-crochets', '--oui'], '', 'reglages-relatifs');

      expect(outcome.code).toBe(1);
      expect(outcome.stderr).toContain('CLAUDE_CONFIG_DIR');
      expect(outcome.stdout).toBe('');
      await expect(readdir(join(REPO_ROOT, 'reglages-relatifs'))).rejects.toThrow();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'refuse une option inconnue, sans rien écrire',
    async () => {
      const outcome = await leon(['installer-crochets', '--oui', '--partout']);

      expect(outcome.code).toBe(1);
      await expect(readdir(configDir)).rejects.toThrow();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'les commandes écrites, lancées par un shell dans le dossier du projet, atteignent le script leon du dépôt',
    async () => {
      expect(fakeRepo).toContain(' ');
      expect(fakeRepo).toContain("'");
      await leon(['installer-crochets', '--oui', '--depot', fakeRepo]);
      const { hooks } = JSON.parse(await readFile(settingsPath, 'utf8'));
      const start: string = hooks.SessionStart[0].hooks[0].command;
      const end: string = hooks.SessionEnd[0].hooks[0].command;
      expect(start).toContain(shellQuote(fakeRepo));

      const started = await runShell(start, START_JSON);
      const ended = await runShell(end, END_JSON);

      // Le JSON du crochet arrive intact, et pnpm pose INIT_CWD au dossier du projet : c'est de là (ou du `cwd`
      // du JSON) que `leon briefing` et `leon capter-session` tirent la clé du projet. La commande n'ajoute ni
      // `cd` ni option qui changerait ce dossier.
      expect(started.code).toBe(0);
      expect(started.stdout).toBe(`point|briefing|${START_JSON}|${project}\n`);
      expect(ended.code).toBe(0);
      expect(ended.stdout).toBe(`point|capter-session|${END_JSON}|${project}\n`);
      expect(start).not.toMatch(/\bcd\b/);
      expect(end).not.toMatch(/\bcd\b/);
    },
    TEST_TIMEOUT_MS,
  );
});
