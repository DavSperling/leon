import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Connection, writeConnection } from './connection';
import { consentPath, factsConsent, writeConsent } from './consent';
import { hookCommand, launcherHookCommand, launcherPath } from './hook-commands';
import { SETTINGS_FILE } from './install-hooks';
import { launcherScript, writeLauncher } from './launcher';
import { runSetup, type SetupDeps, type SetupOptions } from './setup';

// `leon setup` (S10 du plan « CLI sans clone »), toujours dans un HOME et un CLAUDE_CONFIG_DIR temporaires : jamais le
// vrai ~/.claude ni le vrai ~/.leon. Le navigateur de `leon login` est un faux, qui n'ouvre rien.

const INSTALLED = { kind: 'installee' } as const;
const FAKE_TOKEN = `leon_${'x'.repeat(43)}`;
const CONNECTION: Connection = {
  url: 'https://leon.example',
  jeton: FAKE_TOKEN,
  ordinateur: 'MacBook-Pro',
  espace: 'Acme',
  cree_le: '2026-11-03T10:00:00.000Z',
};

let dir: string;
let home: string;
let claudeDir: string;
let clone: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'leon-setup-'));
  home = join(dir, 'home');
  claudeDir = join(home, '.claude');
  clone = join(dir, 'leon-clone');
  await mkdir(join(clone, 'src', 'cli'), { recursive: true });
  await writeFile(join(clone, 'src', 'cli', 'leon.ts'), '');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

// Ce que le script d'installation (S09) a posé avant de lancer `leon setup` : le Node et la CLI derrière leurs liens.
async function installLeon(): Promise<void> {
  await mkdir(join(home, '.leon', 'runtime', 'actuel'), { recursive: true });
  await writeFile(join(home, '.leon', 'runtime', 'actuel', 'node'), '');
  await mkdir(join(home, '.leon', 'cli', 'actuelle'), { recursive: true });
  await writeFile(join(home, '.leon', 'cli', 'actuelle', 'leon.mjs'), '');
}

const connect = () => writeConnection(home, CONNECTION);
const hasClaudeCode = () => mkdir(claudeDir, { recursive: true });

type Run = { code: number; output: string; questions: string[]; logins: Array<string | undefined> };

// `answers` : ce que « tape » l'utilisateur à chaque question ; une question non prévue fait échouer le test.
// `login` : ce que fait `leon login` ; par défaut il réussit et écrit la connexion, comme le vrai.
async function setup(
  options: Partial<SetupOptions> = {},
  extra: {
    answers?: string[];
    env?: Record<string, string>;
    loginCode?: number;
    whileAsking?: () => Promise<void>;
  } = {},
): Promise<Run> {
  const lines: string[] = [];
  const questions: string[] = [];
  const logins: Array<string | undefined> = [];
  const answers = [...(extra.answers ?? [])];
  const deps: SetupDeps = {
    home,
    env: extra.env ?? {},
    out: (text) => lines.push(text),
    err: (text) => lines.push(text),
    ask: async (question) => {
      questions.push(question);
      await extra.whileAsking?.();
      const answer = answers.shift();
      if (answer === undefined) throw new Error('question inattendue');
      return answer;
    },
    login: async (url) => {
      logins.push(url);
      const code = extra.loginCode ?? 0;
      if (code === 0) await connect();
      return code;
    },
  };
  const code = await runSetup({ yes: false, ...options }, deps);
  return { code, output: lines.join('\n'), questions, logins };
}

// Tout ce que `setup` laisse sur le disque : chemin → droits, date de modification et contenu (un fichier de travail
// resté ou retiré change la date de son dossier).
async function snapshot(): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    const path = join(entry.parentPath, entry.name);
    const info = await stat(path);
    found[path] = entry.isFile()
      ? `${info.mode & 0o777} ${info.mtimeMs} ${await readFile(path, 'utf8')}`
      : `dossier ${info.mode & 0o777} ${info.mtimeMs}`;
  }
  return found;
}

describe('setup : le lanceur', () => {
  it('forme installée par défaut : écrit le lanceur de K8 en 0700, et le dit', async () => {
    await installLeon();
    await connect();

    const run = await setup();

    expect(run.code).toBe(0);
    expect(await readFile(launcherPath(home), 'utf8')).toBe(launcherScript(home, INSTALLED));
    expect((await stat(launcherPath(home))).mode & 0o777).toBe(0o700);
    expect(run.output).toContain(`Launcher written: ${launcherPath(home)}`);
  });

  it('refuse la forme installée quand ~/.leon n’a ni Node ni CLI : un lanceur qui ne mène nulle part casserait tous les crochets', async () => {
    await connect();
    await hasClaudeCode();

    const run = await setup();

    expect(run.code).toBe(1);
    expect(run.output).toContain('--depot');
    expect(await exists(launcherPath(home))).toBe(false);
    expect(await exists(join(claudeDir, SETTINGS_FILE))).toBe(false);
  });

  describe('Leon n’est pas installé dans ~/.leon : la garde cite la commande d’installation', () => {
    const GENERIC = 'curl -fsSL <address of Leon>/install | sh';

    it('avec l’adresse de --url', async () => {
      const run = await setup({ url: 'https://leon.example' });

      expect(run.code).toBe(1);
      expect(run.output).toContain(
        'Install it with `curl -fsSL https://leon.example/install | sh`',
      );
      expect(run.output).toContain('--depot <path>');
      expect(run.output).not.toContain('shown in Leon');
    });

    it('avec l’adresse de la connexion enregistrée, réduite à son origine', async () => {
      await writeConnection(home, { ...CONNECTION, url: 'https://leon.example/app?x=1' });

      const run = await setup();

      expect(run.output).toContain('`curl -fsSL https://leon.example/install | sh`');
      expect(run.output).not.toContain(FAKE_TOKEN);
    });

    it('avec LEON_URL (http sur la machine seule compris)', async () => {
      const run = await setup({}, { env: { LEON_URL: 'http://localhost:3000' } });

      expect(run.output).toContain('`curl -fsSL http://localhost:3000/install | sh`');
    });

    it('sans adresse connue : la forme générique', async () => {
      const run = await setup();

      expect(run.output).toContain(`\`${GENERIC}\``);
    });

    it.each([
      ['http hors machine', 'http://leon.interne'],
      ['un autre schéma', 'file:///etc/passwd'],
      ['un hôte avec une apostrophe', "https://a'b.example"],
      ['un hôte avec $', 'https://a$b.example'],
      ['un compte qui cache l’hôte', 'http://localhost:3000@evil.example'],
      ['du texte qui n’est pas une adresse', "'; rm -rf ~; '"],
    ])(
      'n’écrit jamais dans la commande une adresse qui n’est pas simple (%s)',
      async (_name, url) => {
        const run = await setup({ url });

        expect(run.output).toContain(`\`${GENERIC}\``);
        expect(run.output).not.toContain(url);
      },
    );

    it('n’écrit rien : ni lanceur, ni réglages', async () => {
      await hasClaudeCode();

      const run = await setup({ url: 'https://leon.example' });

      expect(run.code).toBe(1);
      expect(await exists(launcherPath(home))).toBe(false);
      expect(await exists(join(claudeDir, SETTINGS_FILE))).toBe(false);
    });
  });

  it('--depot : la forme clone, avec le chemin absolu du clone', async () => {
    await connect();

    const run = await setup({ depot: clone });

    expect(run.code).toBe(0);
    expect(await readFile(launcherPath(home), 'utf8')).toBe(
      launcherScript(home, { kind: 'clone', repoDir: clone }),
    );
    expect(run.output).toContain(`Launcher written: ${launcherPath(home)}`);
  });

  it('--depot sur un dossier qui n’est pas un dépôt de Leon : refusé, rien n’est écrit', async () => {
    await connect();

    const run = await setup({ depot: dir });

    expect(run.code).toBe(1);
    expect(run.output).toContain('not a Leon repository');
    expect(await exists(launcherPath(home))).toBe(false);
  });

  describe('un autre lanceur est déjà là', () => {
    beforeEach(async () => {
      await installLeon();
      await connect();
      await hasClaudeCode();
      await writeLauncher(home, { kind: 'clone', repoDir: clone });
    });
    const old = () => launcherScript(home, { kind: 'clone', repoDir: clone });

    it('montre l’ancien et le nouveau, et demande confirmation', async () => {
      const run = await setup({}, { answers: ['y', 'n'] });

      expect(run.questions[0]).toContain('[y/N]');
      for (const line of [
        ...old().trim().split('\n'),
        ...launcherScript(home, INSTALLED).trim().split('\n'),
      ]) {
        expect(run.output).toContain(line);
      }
      expect(run.output).toContain('exec pnpm');
      expect(run.output).toContain('runtime/actuel/node');
      expect(await readFile(launcherPath(home), 'utf8')).toBe(launcherScript(home, INSTALLED));
      expect(run.output).toContain(`Launcher replaced: ${launcherPath(home)}`);
    });

    it('sur « non » : le lanceur est gardé, et rien d’autre n’est fait (ni connexion, ni crochets)', async () => {
      const before = await snapshot();

      const run = await setup({}, { answers: ['n'] });

      expect(run.code).toBe(1);
      expect(run.output).toContain('not replaced');
      expect(run.logins).toEqual([]);
      expect(await readFile(launcherPath(home), 'utf8')).toBe(old());
      expect(await snapshot()).toEqual(before);
    });

    it('--yes ne confirme pas à sa place le remplacement d’un lanceur pointé vers un clone', async () => {
      // Entrée fermée : la question reste sans réponse, donc sans « oui ».
      const run = await setup({ yes: true }, { answers: [''] });

      expect(run.code).toBe(1);
      expect(run.questions).toHaveLength(1);
      expect(await readFile(launcherPath(home), 'utf8')).toBe(old());
    });

    it('refuse de remplacer un lanceur qui a changé pendant que l’utilisateur répondait', async () => {
      const other = '#!/bin/sh\necho changé entre-temps\n';

      const run = await setup(
        {},
        { answers: ['y'], whileAsking: () => writeFile(launcherPath(home), other) },
      );

      expect(run.code).toBe(1);
      expect(run.output).toContain('changed while you were answering');
      expect(await readFile(launcherPath(home), 'utf8')).toBe(other);
      expect(run.logins).toEqual([]);
    });
  });

  it('--yes remplace sans question le lanceur de la forme installée, que Leon a écrit', async () => {
    await installLeon();
    await connect();
    await writeLauncher(home, INSTALLED);

    const run = await setup({ yes: true, depot: clone });

    expect(run.code).toBe(0);
    expect(run.questions).toEqual([]);
    expect(await readFile(launcherPath(home), 'utf8')).toBe(
      launcherScript(home, { kind: 'clone', repoDir: clone }),
    );
  });

  it('un lanceur qui n’est pas de Leon est montré et demandé, même avec --yes', async () => {
    await installLeon();
    await connect();
    await mkdir(join(home, '.leon', 'bin'), { recursive: true });
    await writeFile(launcherPath(home), '#!/bin/sh\necho à moi\n');

    const run = await setup({ yes: true }, { answers: [''] });

    expect(run.code).toBe(1);
    expect(run.output).toContain('echo à moi');
    expect(await readFile(launcherPath(home), 'utf8')).toBe('#!/bin/sh\necho à moi\n');
  });
});

describe('setup : la connexion', () => {
  beforeEach(installLeon);

  it('ordinateur déjà connecté : pas de login', async () => {
    await connect();

    const run = await setup();

    expect(run.code).toBe(0);
    expect(run.logins).toEqual([]);
    expect(run.output).toContain('already connected');
  });

  it('ordinateur déjà connecté : nomme le serveur (son origine seulement), jamais le jeton', async () => {
    await writeConnection(home, { ...CONNECTION, url: 'https://leon.example/app/?x=1#y' });

    const run = await setup();

    expect(run.output).toContain(
      'This computer is already connected to Leon (https://leon.example).',
    );
    expect(run.output).not.toContain(FAKE_TOKEN);
    expect(run.output).not.toContain('/app');
    expect(run.output).not.toContain('x=1');
  });

  it('LEON_URL et LEON_TOKEN posés : nomme ce serveur-là, sans le jeton', async () => {
    await connect();

    const run = await setup(
      {},
      { env: { LEON_URL: 'http://localhost:3000/', LEON_TOKEN: `leon_${'y'.repeat(43)}` } },
    );

    expect(run.output).toContain('already connected to Leon (http://localhost:3000).');
    expect(run.output).not.toContain('leon.example');
    expect(run.output).not.toContain('y'.repeat(43));
  });

  it('LEON_URL et LEON_TOKEN posés : l’ordinateur est connecté, pas de login', async () => {
    const run = await setup(
      {},
      { env: { LEON_URL: 'http://localhost:3000', LEON_TOKEN: FAKE_TOKEN } },
    );

    expect(run.code).toBe(0);
    expect(run.logins).toEqual([]);
  });

  it('pas connecté : lance login, avec l’adresse de --url, puis installe les crochets', async () => {
    await hasClaudeCode();

    const run = await setup({ url: 'https://leon.example' }, { answers: ['y'] });

    expect(run.code).toBe(0);
    expect(run.logins).toEqual(['https://leon.example']);
    expect(
      (await readFile(join(claudeDir, SETTINGS_FILE), 'utf8')).includes('capter-session'),
    ).toBe(true);
  });

  it('pas connecté, sans --url : login sans adresse (il prend LEON_URL ou celle de la connexion)', async () => {
    const run = await setup();

    expect(run.logins).toEqual([undefined]);
  });

  it('login échoue : setup s’arrête sans poser de crochet, et dit de le relancer', async () => {
    await hasClaudeCode();

    const run = await setup({}, { loginCode: 1 });

    expect(run.code).toBe(1);
    expect(run.output).toContain('not connected');
    expect(run.output).toContain('leon setup');
    expect(run.questions).toEqual([]);
    expect(await exists(join(claudeDir, SETTINGS_FILE))).toBe(false);
    expect(await exists(consentPath(home))).toBe(false);
  });

  it('n’affiche jamais le jeton', async () => {
    await connect();
    await hasClaudeCode();

    const run = await setup({}, { answers: ['y'] });

    expect(run.output).not.toContain(FAKE_TOKEN);
  });
});

describe('setup : les outils de code', () => {
  beforeEach(async () => {
    await installLeon();
    await connect();
  });

  it('Claude Code absent : rien n’est écrit dans ~/.claude, ni accord, et la ligne le dit', async () => {
    const run = await setup();

    expect(run.code).toBe(0);
    expect(run.questions).toEqual([]);
    expect(await exists(claudeDir)).toBe(false);
    expect(await exists(consentPath(home))).toBe(false);
    expect(run.output).toContain('Claude Code: not found');
  });

  it('Claude Code présent : montre le texte d’accord, puis installe les crochets du lanceur (K9) et l’accord', async () => {
    await hasClaudeCode();

    const run = await setup({}, { answers: ['y'] });

    expect(run.code).toBe(0);
    expect(run.output).toContain('ALL your Claude Code sessions');
    expect(run.output).toContain('Secrets are masked before sending');
    expect(run.questions).toHaveLength(1);
    expect(JSON.parse(await readFile(join(claudeDir, SETTINGS_FILE), 'utf8'))).toEqual({
      hooks: {
        SessionStart: [
          {
            hooks: [
              { type: 'command', command: launcherHookCommand(home, 'briefing'), timeout: 10 },
            ],
          },
        ],
        SessionEnd: [
          {
            hooks: [
              {
                type: 'command',
                command: launcherHookCommand(home, 'capter-session'),
                timeout: 30,
              },
            ],
          },
        ],
      },
    });
    expect((await factsConsent(home, 'claude_code'))?.version).toBe(2);
    expect(run.output).toContain('Claude Code: hooks installed');
  });

  it('installée : n’annonce pas que les crochets ont besoin de pnpm et de Node dans le PATH', async () => {
    await hasClaudeCode();

    const run = await setup({}, { answers: ['n'] });

    expect(run.output).not.toContain('packageManager');
    expect(run.output).not.toContain('.env.local');
  });

  it('l’accord n’est écrit qu’après la confirmation : sur « non », ni réglages ni accord', async () => {
    await hasClaudeCode();

    const run = await setup({}, { answers: ['n'] });

    expect(run.code).toBe(0);
    expect(run.questions[0]).toContain(consentPath(home));
    expect(await exists(join(claudeDir, SETTINGS_FILE))).toBe(false);
    expect(await exists(consentPath(home))).toBe(false);
    expect(run.output).toContain('Claude Code: skipped');
  });

  it('--yes accepte tout : aucune question, crochets et accord écrits', async () => {
    await hasClaudeCode();

    const run = await setup({ yes: true });

    expect(run.code).toBe(0);
    expect(run.questions).toEqual([]);
    expect(await exists(join(claudeDir, SETTINGS_FILE))).toBe(true);
    expect((await factsConsent(home, 'claude_code'))?.version).toBe(2);
  });

  it('CLAUDE_CONFIG_DIR : les crochets vont dans ce dossier, et ~/.claude n’est pas touché', async () => {
    const custom = join(dir, 'reglages-claude');
    await mkdir(custom);
    await hasClaudeCode();
    const before = await readdir(claudeDir);

    const run = await setup({ yes: true }, { env: { CLAUDE_CONFIG_DIR: custom } });

    expect(run.code).toBe(0);
    expect(await exists(join(custom, SETTINGS_FILE))).toBe(true);
    expect(await readdir(claudeDir)).toEqual(before);
  });

  it('CLAUDE_CONFIG_DIR relatif : refusé avant d’écrire quoi que ce soit', async () => {
    const run = await setup({ yes: true }, { env: { CLAUDE_CONFIG_DIR: 'reglages-relatifs' } });

    expect(run.code).toBe(1);
    expect(run.output).toContain('CLAUDE_CONFIG_DIR');
    expect(await exists(join(home, '.leon', 'bin'))).toBe(false);
  });

  it('CLAUDE_CONFIG_DIR posé vers un dossier absent : Claude Code n’est pas détecté', async () => {
    await hasClaudeCode(); // ~/.claude existe, mais ce n'est pas celui que Claude Code lit

    const run = await setup({ yes: true }, { env: { CLAUDE_CONFIG_DIR: join(dir, 'absent') } });

    expect(run.output).toContain('Claude Code: not found');
    expect(await exists(join(dir, 'absent'))).toBe(false);
    expect(await exists(join(claudeDir, SETTINGS_FILE))).toBe(false);
  });

  it.each([
    ['Codex', '.codex'],
    ['Cursor', '.cursor'],
    ['Gemini / Antigravity', '.gemini'],
  ] as const)(
    '%s présent : « not supported yet », rien n’est écrit chez lui',
    async (label, folder) => {
      await hasClaudeCode();
      const toolDir = join(home, folder);
      await mkdir(toolDir);

      const run = await setup({ yes: true });

      expect(run.code).toBe(0);
      expect(run.output).toContain(`${label}: not supported yet`);
      expect(await readdir(toolDir)).toEqual([]);
      // Claude Code, lui, est installé.
      expect(run.output).toContain('Claude Code: hooks installed');
    },
  );

  it('CODEX_HOME remplace ~/.codex : c’est ce dossier qu’on cherche', async () => {
    const elsewhere = join(dir, 'codex-ailleurs');
    await mkdir(join(home, '.codex'));

    const absent = await setup({}, { env: { CODEX_HOME: elsewhere } });
    await mkdir(elsewhere);
    const present = await setup({}, { env: { CODEX_HOME: elsewhere } });

    expect(absent.output).toContain('Codex: not found');
    expect(present.output).toContain('Codex: not supported yet');
    expect(await readdir(elsewhere)).toEqual([]);
    expect(await readdir(join(home, '.codex'))).toEqual([]);
  });

  it('finit par une ligne par outil et le chemin du lanceur', async () => {
    await hasClaudeCode();
    await mkdir(join(home, '.codex'));

    const run = await setup({ yes: true });

    const lines = run.output.split('\n');
    const summary = lines.slice(lines.indexOf('Summary'));
    expect(summary).toEqual([
      'Summary',
      '  Claude Code: hooks installed',
      '  Codex: not supported yet',
      '  Cursor: not found',
      '  Gemini / Antigravity: not found',
      '',
      'To run Leon later: ~/.leon/bin/leon <command>',
    ]);
  });

  it('des réglages de Claude Code illisibles : code 1, rien d’écrit chez lui, et la ligne le dit', async () => {
    await hasClaudeCode();
    await writeFile(join(claudeDir, SETTINGS_FILE), '{ pas du json');

    const run = await setup({ yes: true });

    expect(run.code).toBe(1);
    expect(await readFile(join(claudeDir, SETTINGS_FILE), 'utf8')).toBe('{ pas du json');
    expect(run.output).toContain('Claude Code: hooks NOT installed');
  });

  it('forme clone : les crochets appellent le lanceur, qui lance le clone, et préviennent des réglages du clone', async () => {
    await hasClaudeCode();

    const run = await setup({ yes: true, depot: clone });

    expect(run.code).toBe(0);
    const { hooks } = JSON.parse(await readFile(join(claudeDir, SETTINGS_FILE), 'utf8'));
    expect(hooks.SessionStart[0].hooks[0].command).toBe(launcherHookCommand(home, 'briefing'));
    expect(await readFile(launcherPath(home), 'utf8')).toContain(`--dir '${clone}' leon`);
    expect(run.output).toContain('pnpm');
  });
});

describe('setup : relancé', () => {
  it('une seconde fois, ne pose aucune question et n’écrit rien', async () => {
    await installLeon();
    await hasClaudeCode();
    await mkdir(join(home, '.codex'));
    const first = await setup({}, { answers: ['y'] });
    expect(first.code).toBe(0);
    const before = await snapshot();

    const second = await setup();

    expect(second.code).toBe(0);
    expect(second.questions).toEqual([]);
    expect(second.logins).toEqual([]);
    expect(second.output).toContain(`Launcher already in place: ${launcherPath(home)}`);
    expect(second.output).toContain('Claude Code: hooks installed');
    expect(await snapshot()).toEqual(before);
  });

  it('forme clone aussi', async () => {
    await connect();
    await hasClaudeCode();
    await setup({ depot: clone }, { answers: ['y'] });
    const before = await snapshot();

    const second = await setup({ depot: clone });

    expect(second.code).toBe(0);
    expect(second.questions).toEqual([]);
    expect(await snapshot()).toEqual(before);
  });
});

// Une installation d'avant le lanceur : crochets `pnpm … --dir <clone> leon …` dans les réglages de Claude Code, accord déjà
// en version 2, et un jeton dans le `.env.local` du clone (que `setup` ne lit jamais).
describe('setup : migrer une installation d’avant le lanceur', () => {
  const NEW_START = () => launcherHookCommand(home, 'briefing');
  const NEW_END = () => launcherHookCommand(home, 'capter-session');
  let oldClone: string;
  let envLocal: string;
  const yours = { type: 'command', command: 'echo à moi' };

  const oldSettings = () => ({
    theme: 'dark',
    hooks: {
      SessionStart: [
        { hooks: [{ type: 'command', command: hookCommand(oldClone, 'briefing'), timeout: 10 }] },
      ],
      PreToolUse: [{ matcher: 'Bash', hooks: [yours] }],
      SessionEnd: [
        {
          hooks: [
            { type: 'command', command: hookCommand(oldClone, 'capter-session'), timeout: 30 },
          ],
        },
      ],
    },
  });
  const readSettings = async () =>
    JSON.parse(await readFile(join(claudeDir, SETTINGS_FILE), 'utf8'));

  beforeEach(async () => {
    await installLeon();
    await hasClaudeCode();
    oldClone = join(dir, 'ancien-clone');
    envLocal = `LEON_URL=https://leon.example\nLEON_TOKEN=${FAKE_TOKEN}\n`;
    await mkdir(oldClone, { recursive: true });
    await writeFile(join(oldClone, '.env.local'), envLocal);
    await writeFile(join(claudeDir, SETTINGS_FILE), `${JSON.stringify(oldSettings(), null, 2)}\n`);
    await writeConsent(home, 'claude_code', 2, new Date('2026-10-20T08:00:00.000Z'));
  });

  it('remplace les crochets sur place, garde l’accord tel quel et dit où était le clone', async () => {
    const consent = await readFile(consentPath(home), 'utf8');

    const run = await setup({}, { answers: ['y'] });

    expect(run.code).toBe(0);
    expect(run.output).toContain(
      `Your hooks used to run Leon from ${oldClone}; they now run ~/.leon/bin/leon. The token in ${oldClone}/.env.local is no longer needed: revoke it in Settings › Connected computers.`,
    );
    expect(await readSettings()).toEqual({
      theme: 'dark',
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: NEW_START(), timeout: 10 }] }],
        PreToolUse: [{ matcher: 'Bash', hooks: [yours] }],
        SessionEnd: [{ hooks: [{ type: 'command', command: NEW_END(), timeout: 30 }] }],
      },
    });
    expect(await readFile(consentPath(home), 'utf8')).toBe(consent);
    // Une seule question, celle des réglages : l’accord en version 2 n’est pas redemandé.
    expect(run.questions).toHaveLength(1);
    expect(run.questions[0]).not.toContain('consent');
    expect(run.output).toContain('Claude Code: hooks installed');
  });

  it('pas connecté (le jeton n’était que dans le .env.local) : lance leon login, ne lit pas ce fichier', async () => {
    const run = await setup({ url: 'https://leon.example' }, { answers: ['y'] });

    expect(run.logins).toEqual(['https://leon.example']);
    expect(run.output).not.toContain(FAKE_TOKEN);
    expect(await readFile(join(oldClone, '.env.local'), 'utf8')).toBe(envLocal);
  });

  it('relancée : rien ne change et rien n’est redit', async () => {
    await connect();
    await setup({}, { answers: ['y'] });
    const before = await snapshot();

    const second = await setup();

    expect(second.code).toBe(0);
    expect(second.questions).toEqual([]);
    expect(second.output).not.toContain('used to run Leon');
    expect(second.output).toContain('Claude Code: hooks installed');
    expect(await snapshot()).toEqual(before);
  });

  it('sur « non » : les crochets d’avant restent, sans message sur le jeton', async () => {
    await connect();
    const text = await readFile(join(claudeDir, SETTINGS_FILE), 'utf8');

    const run = await setup({}, { answers: ['n'] });

    expect(run.output).not.toContain('used to run Leon');
    expect(await readFile(join(claudeDir, SETTINGS_FILE), 'utf8')).toBe(text);
    expect(run.output).toContain('Claude Code: skipped');
  });

  it('--depot : les crochets passent au lanceur, mais le .env.local du clone sert toujours : aucun message sur le jeton', async () => {
    await connect();

    const run = await setup({ depot: clone, yes: true });

    expect(run.code).toBe(0);
    expect((await readSettings()).hooks.SessionStart[0].hooks[0].command).toBe(NEW_START());
    expect(run.output).not.toContain('used to run Leon');
    expect(run.output).not.toContain('no longer needed');
  });
});
