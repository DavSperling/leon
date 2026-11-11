import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_PATHS, type AuthorizeUsage, type Usage } from '../capture/api-contract';
import { type Connection, readConnection, writeConnection } from './connection';
import { addRefusal, addUsage, consentPath, factsConsent, writeConsent } from './consent';
import { hookCommand, launcherCommand, launcherHookCommand, launcherPath } from './hook-commands';
import { SETTINGS_FILE } from './install-hooks';
import { launcherScript, previousLauncherScripts, writeLauncher } from './launcher';
import { runSetup, type SetupDeps, type SetupOptions } from './setup';
import { EARLIER_WITHDRAWAL_NOT_TOLD_MESSAGE } from './uninstall-hooks';

// `leon setup` (S10 du plan « CLI sans clone »), toujours dans un HOME et un CLAUDE_CONFIG_DIR temporaires : jamais le
// vrai ~/.claude ni le vrai ~/.leon. Le navigateur de `leon login` est un faux, qui n'ouvre rien.

const INSTALLED = { kind: 'installee' } as const;
// La dernière ligne du résumé sous la forme installée (I3 de la relecture finale).
const UPDATES =
  'Leon updates itself, at most once a day, from the server this computer is connected to. To go back to the previous version: ~/.leon/bin/leon update --previous';
const FAKE_TOKEN = `leon_${'x'.repeat(43)}`;
const CONNECTION: Connection = {
  url: 'https://leon.example',
  jeton: FAKE_TOKEN,
  ordinateur: 'MacBook-Pro',
  espace: 'Acme',
  cree_le: '2026-11-03T10:00:00.000Z',
};
// Ce que GET /api/v1/me rend au jeton de la connexion : le compte et l'espace que la relance doit retrouver.
const PROFILE = {
  userId: '6f1c2a4e-0b7d-4c1e-9a3f-2d5b8e7c1a90',
  tenantId: '2b9e4d7a-5c3f-4e8b-a1d6-7f0c9e2b4a13',
  userName: 'Paul',
  email: 'paul@example.com',
  organizationName: 'Acme',
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

type Request = { url: string; authorization: string | null };
type Run = {
  code: number;
  output: string;
  questions: string[];
  logins: Array<string | undefined>;
  // Ce que chaque `leon login` demandait : les cases de la page, et s'il relançait un ordinateur déjà connecté.
  asked: { usages: string[]; relance: boolean }[];
  // Le compte et l'espace que chaque `leon login` devait retrouver (la relance seulement).
  attendus: ({ userId: string; tenantId: string } | undefined)[];
  requests: Request[];
};

// `answers` : ce que « tape » l'utilisateur à chaque question ; une question non prévue fait échouer le test.
// `login` : ce que fait `leon login` ; par défaut il réussit et écrit la connexion, comme le vrai.
// `page` : ce que l'humain coche et décoche sur la page « Autoriser », que le faux `leon login` rend tel quel (le vrai
// le filtre sur sa demande, login.test.ts) ; par défaut rien, comme un serveur plus ancien.
// `me` : ce que répond GET /api/v1/me au jeton de la connexion (200 et PROFILE par défaut) ; 'unreachable' : le serveur ne
// répond pas ; 'malformed' : 200 avec un corps qui n'est pas un profil.
// `loginThrows` : la relance lève, comme le vrai `leon login` quand l'écoute sur 127.0.0.1 est refusée (bac à sable).
async function setup(
  options: Partial<SetupOptions> = {},
  extra: {
    answers?: (string | null)[];
    env?: Record<string, string>;
    loginCode?: number;
    page?: { usages?: Usage[]; refus?: Usage[] };
    me?: number | 'unreachable' | 'malformed';
    loginThrows?: boolean;
    whileAsking?: () => Promise<void>;
    // Appelé à chaque requête, avant sa réponse : ce que le disque porte à ce moment-là.
    whileFetching?: (url: string, init?: RequestInit) => Promise<void>;
    interactive?: boolean;
  } = {},
): Promise<Run> {
  const lines: string[] = [];
  const questions: string[] = [];
  const logins: Array<string | undefined> = [];
  const asked: Run['asked'] = [];
  const attendus: Run['attendus'] = [];
  const requests: Request[] = [];
  const answers = [...(extra.answers ?? [])];
  const deps: SetupDeps = {
    home,
    env: extra.env ?? {},
    interactive: extra.interactive ?? false,
    out: (text) => lines.push(text),
    err: (text) => lines.push(text),
    ask: async (question) => {
      questions.push(question);
      await extra.whileAsking?.();
      const answer = answers.shift();
      if (answer === undefined) throw new Error('question inattendue');
      return answer;
    },
    login: async ({ url, usages, relance, attendu }) => {
      logins.push(url);
      asked.push({ usages: [...usages], relance });
      attendus.push(attendu);
      if (relance && extra.loginThrows) {
        throw new Error(
          'Could not listen on 127.0.0.1 (EPERM). Run `leon login --with-token` instead.',
        );
      }
      const code = extra.loginCode ?? 0;
      if (code !== 0) return { code, usages: [], refus: [] };
      await connect();
      // Tel quel, même hors de la demande : setup ne doit écrire que ce qu'il a demandé.
      const page = (list: Usage[] = []) => list as AuthorizeUsage[];
      return { code, usages: page(extra.page?.usages), refus: page(extra.page?.refus) };
    },
    fetch: async (input, init) => {
      requests.push({
        url: String(input),
        authorization: new Headers(init?.headers).get('Authorization'),
      });
      await extra.whileFetching?.(String(input), init);
      if (extra.me === 'unreachable') throw new TypeError('fetch failed');
      const status = extra.me === 'malformed' ? 200 : (extra.me ?? 200);
      const profile =
        extra.me !== 'malformed' &&
        status === 200 &&
        new URL(String(input)).pathname === API_PATHS.me;
      return new Response(profile ? JSON.stringify(PROFILE) : '{}', { status });
    },
  };
  const code = await runSetup({ yes: false, ...options }, deps);
  return { code, output: lines.join('\n'), questions, logins, asked, attendus, requests };
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

  // T19 : le lanceur gagne la fin détachée ; celui du lot 4, écrit par Leon, se remplace sans question avec --yes.
  it('--yes remplace sans demander le lanceur installé d’une version précédente de Leon', async () => {
    await installLeon();
    await connect();
    await hasClaudeCode();
    const [previous] = previousLauncherScripts(home, INSTALLED);
    await mkdir(join(home, '.leon', 'bin'), { recursive: true });
    await writeFile(launcherPath(home), previous ?? '', { mode: 0o700 });

    const run = await setup({ yes: true });

    expect(run.questions.filter((question) => question.includes('Replace it?'))).toEqual([]);
    expect(await readFile(launcherPath(home), 'utf8')).toBe(launcherScript(home, INSTALLED));
    expect(run.output).toContain(`Launcher replaced: ${launcherPath(home)}`);
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

  it('LEON_URL et LEON_TOKEN posés sans connexion enregistrée : lance login, et le dit (un Claude Code lancé du Dock ne voit pas ces variables)', async () => {
    const run = await setup(
      {},
      { env: { LEON_URL: 'http://localhost:3000', LEON_TOKEN: FAKE_TOKEN } },
    );

    expect(run.code).toBe(0);
    expect(run.logins).toEqual([undefined]);
    expect(run.output).toContain('LEON_URL and LEON_TOKEN');
    expect(run.output).toContain('~/.leon/bin/leon login');
    expect(run.output).not.toContain('already connected');
    expect(run.output).not.toContain(FAKE_TOKEN);
    expect(run.requests).toEqual([]);
  });

  describe('l’ordinateur n’est plus connecté : setup le reconnecte', () => {
    it('jeton révoqué (le serveur répond 401 à /me) : le dit, sans le jeton, et lance login', async () => {
      await connect();

      const run = await setup({}, { me: 401 });

      expect(run.code).toBe(0);
      expect(run.requests).toEqual([
        { url: 'https://leon.example/api/v1/me', authorization: `Bearer ${FAKE_TOKEN}` },
      ]);
      expect(run.logins).toEqual([undefined]);
      expect(run.output).toContain(
        'This computer was disconnected from Leon (its token was revoked): connecting it again.',
      );
      expect(run.output).not.toContain('already connected');
      expect(run.output).not.toContain(FAKE_TOKEN);
    });

    it('jeton révoqué : le login suivi des crochets, comme pour un ordinateur neuf', async () => {
      await connect();
      await hasClaudeCode();

      const run = await setup({}, { me: 401, answers: ['y'] });

      expect(run.code).toBe(0);
      expect(run.logins).toHaveLength(1);
      expect(run.output).toContain('Claude Code: hooks installed');
    });

    it('jeton révoqué et login qui échoue : setup s’arrête sans poser de crochet', async () => {
      await connect();
      await hasClaudeCode();

      const run = await setup({}, { me: 401, loginCode: 1 });

      expect(run.code).toBe(1);
      expect(run.questions).toEqual([]);
      expect(await exists(join(claudeDir, SETTINGS_FILE))).toBe(false);
    });

    it('serveur injoignable : l’ordinateur compte comme connecté (une installation hors ligne n’est pas bloquée)', async () => {
      await connect();

      const run = await setup({}, { me: 'unreachable' });

      expect(run.code).toBe(0);
      expect(run.requests).toHaveLength(1);
      expect(run.logins).toEqual([]);
      expect(run.output).toContain('already connected');
    });

    it.each([500, 403, 404])(
      'une autre erreur (%i) compte aussi comme connecté',
      async (status) => {
        await connect();

        const run = await setup({}, { me: status });

        expect(run.logins).toEqual([]);
        expect(run.output).toContain('already connected');
      },
    );

    it('--url d’une autre origine : dit les deux origines (jamais le jeton) et lance login avec la nouvelle', async () => {
      await connect();

      const run = await setup({ url: 'https://autre.example/chemin' });

      expect(run.logins).toEqual(['https://autre.example/chemin']);
      expect(run.output).toContain('https://leon.example');
      expect(run.output).toContain('https://autre.example');
      expect(run.output).not.toContain('/chemin');
      expect(run.output).not.toContain(FAKE_TOKEN);
      expect(run.output).not.toContain('already connected');
      // Le jeton est celui de l'autre serveur : inutile de le lui présenter.
      expect(run.requests).toEqual([]);
    });

    it('--url de la même origine (chemin et barre finale en plus) : rien à refaire', async () => {
      await connect();

      const run = await setup({ url: 'https://leon.example/' });

      expect(run.logins).toEqual([]);
      expect(run.output).toContain('already connected');
    });

    it('--url mal formée avec une connexion : login la refuse, setup s’arrête', async () => {
      await connect();
      await hasClaudeCode();

      const run = await setup({ url: 'ftp://leon.example' }, { loginCode: 1 });

      expect(run.code).toBe(1);
      expect(run.logins).toEqual(['ftp://leon.example']);
      expect(run.output).not.toContain('ftp://');
      expect(await exists(join(claudeDir, SETTINGS_FILE))).toBe(false);
    });

    it('connexion enregistrée ET variables : le 401 de la connexion se contrôle quand même', async () => {
      await connect();

      const run = await setup(
        {},
        {
          me: 401,
          env: { LEON_URL: 'http://localhost:3000', LEON_TOKEN: `leon_${'y'.repeat(43)}` },
        },
      );

      expect(run.logins).toHaveLength(1);
      expect(run.requests).toEqual([
        { url: 'https://leon.example/api/v1/me', authorization: `Bearer ${FAKE_TOKEN}` },
      ]);
    });

    it('connexion illisible : comme pas connecté, et sans rien demander au serveur', async () => {
      await mkdir(join(home, '.leon'), { recursive: true });
      await writeFile(join(home, '.leon', 'connexion.json'), '{ pas du json');

      const run = await setup();

      expect(run.logins).toEqual([undefined]);
      expect(run.requests).toEqual([]);
    });
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
    expect(run.output).toContain('`~/.leon/bin/leon setup`');
    expect(run.output).toContain('`~/.leon/bin/leon login`');
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

  // L'usage `resume` (C7 révisé, D30) : demandé à part dans un terminal, jamais donné par --yes ni hors d'un terminal.
  // `lecture` est demandé avant lui : « plus tard » ne le tranche pas (décision d'Amos du 11/11).
  it('dans un terminal, propose l’usage resume après l’accord de base ; accepté, il est écrit', async () => {
    await hasClaudeCode();

    const run = await setup({}, { interactive: true, answers: ['y', 'plus tard', 'y'] });

    expect(run.code).toBe(0);
    expect(run.questions).toHaveLength(3);
    expect(await factsConsent(home, 'claude_code')).toMatchObject({
      version: 2,
      usages: ['resume'],
    });
    expect(run.output).toContain('Claude Code: hooks installed');
  });

  it.each([
    ['--yes, même dans un terminal', { yes: true }, { interactive: true }],
    ['hors terminal, même avec « y »', {}, { answers: ['y', 'y'] }],
  ])('%s : aucun usage', async (_name, options, extra) => {
    await hasClaudeCode();

    const run = await setup(options, extra);

    expect(run.questions.length).toBeLessThanOrEqual(1);
    expect((await factsConsent(home, 'claude_code'))?.usages).toEqual([]);
    expect((await factsConsent(home, 'claude_code'))?.refus).toEqual([]);
  });

  // C7 révisé, A16 : un refus s'écrit daté ; setup relancé ne le propose plus, et ne fait perdre ni usage ni refus.
  it('dans un terminal, un refus de l’usage resume s’écrit ; relancée, setup ne le redemande pas et garde l’accord tel quel', async () => {
    await hasClaudeCode();
    const first = await setup({}, { interactive: true, answers: ['y', 'plus tard', 'n'] });
    expect(first.questions).toHaveLength(3);
    expect(await factsConsent(home, 'claude_code')).toMatchObject({
      version: 2,
      usages: [],
      refus: ['resume'],
    });
    await addUsage(home, 'claude_code', 'lecture');
    const consent = await readFile(consentPath(home), 'utf8');

    const second = await setup({}, { interactive: true });

    expect(second.code).toBe(0);
    expect(second.questions).toEqual([]);
    expect(second.output).toContain('Claude Code: hooks installed');
    expect(await readFile(consentPath(home), 'utf8')).toBe(consent);
  });

  // Décision d'Amos du 11/11 : une question par usage pour tous les outils trouvés, au premier qui en manque ; la
  // réponse s'écrit pour chacun, après son accord de base. Antigravity se trouve par ~/.gemini comme par son dossier
  // propre (#162).
  const allTools = async () => {
    await hasClaudeCode();
    for (const tool of ['.codex', '.cursor', join('.gemini', 'antigravity')]) {
      await mkdir(join(home, tool), { recursive: true });
    }
  };
  const lectureAsked = (run: Run) => run.questions.filter((question) => question.includes('[Y/n]'));

  it('dans un terminal : une question par usage pour tous les outils du passage, écrite pour chacun après son accord', async () => {
    await allTools();

    // Claude Code, lecture, resume, puis Codex, Cursor (refusé) et Antigravity.
    const run = await setup({}, { interactive: true, answers: ['y', '', 'n', 'y', 'n', 'y'] });

    expect(run.code).toBe(0);
    expect(run.questions).toHaveLength(6);
    expect(lectureAsked(run)).toHaveLength(1);
    expect(run.output.split('usage "lecture"')).toHaveLength(2);
    for (const tool of ['claude_code', 'codex', 'antigravity'] as const) {
      expect(await factsConsent(home, tool), tool).toMatchObject({
        usages: ['lecture'],
        refus: ['resume'],
      });
    }
    // Un outil dont l'accord de base est refusé n'en reçoit aucun.
    expect(await factsConsent(home, 'cursor')).toBeNull();
    expect(run.output).toContain('`~/.leon/bin/leon retirer-crochets --outil codex`');
  });

  it('seulement pour les outils qui en manquent sans refus : la question vient au premier d’entre eux', async () => {
    await hasClaudeCode();
    await setup({ yes: true });
    await addRefusal(home, 'claude_code', 'lecture');
    await addUsage(home, 'claude_code', 'resume');
    const claudeCode = await factsConsent(home, 'claude_code');
    await mkdir(join(home, '.cursor'));

    const run = await setup({}, { interactive: true, answers: ['y', 'y', 'n'] });

    expect(run.code).toBe(0);
    expect(run.questions).toHaveLength(3);
    expect(run.questions[1]).toContain('[Y/n]');
    expect(await factsConsent(home, 'claude_code')).toEqual(claudeCode);
    expect(await factsConsent(home, 'cursor')).toMatchObject({
      usages: ['lecture'],
      refus: ['resume'],
    });
  });

  it('une entrée fermée ou une autre réponse : rien n’est écrit, ni redemandé dans le passage', async () => {
    await allTools();

    const run = await setup({}, { interactive: true, answers: ['y', null, null, 'y', 'y', 'y'] });

    expect(run.questions).toHaveLength(6);
    for (const tool of ['claude_code', 'codex', 'cursor', 'antigravity'] as const) {
      expect(await factsConsent(home, tool), tool).toMatchObject({ usages: [], refus: [] });
    }
  });

  it.each([
    ['--yes, même dans un terminal', { yes: true }, { interactive: true }],
    ['hors terminal, même avec « y »', {}, { answers: Array<string>(8).fill('y') }],
  ])('%s : aucun usage ni refus, pour aucun des quatre outils', async (_name, options, extra) => {
    await allTools();

    const run = await setup(options, extra);

    expect(run.questions.length).toBeLessThanOrEqual(4);
    expect(run.output).not.toContain('usage "lecture"');
    for (const tool of ['claude_code', 'codex', 'cursor', 'antigravity'] as const) {
      expect(await factsConsent(home, tool), tool).toMatchObject({ usages: [], refus: [] });
    }
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

  it('Cursor présent : ses crochets sont posés (forme plate) et son accord de capture écrit', async () => {
    await hasClaudeCode();
    await mkdir(join(home, '.cursor'));

    const run = await setup({ yes: true });

    expect(run.code).toBe(0);
    const { version, hooks } = JSON.parse(
      await readFile(join(home, '.cursor', 'hooks.json'), 'utf8'),
    );
    expect(version).toBe(1);
    expect(hooks.beforeSubmitPrompt[0].command).toBe(launcherCommand(home, 'cursor', 'prompt'));
    expect(hooks.stop[0].command).toBe(launcherCommand(home, 'cursor', 'tour'));
    expect(run.output).toContain('Cursor: hooks installed');
    expect((await factsConsent(home, 'cursor'))?.capture_le).toBeInstanceOf(Date);
  });

  it('Antigravity présent (ici l’IDE) : son entrée `leon` est posée et son accord de capture écrit', async () => {
    await hasClaudeCode();
    await mkdir(join(home, '.gemini', 'antigravity-ide'), { recursive: true });

    const run = await setup({ yes: true });

    expect(run.code).toBe(0);
    const { leon } = JSON.parse(
      await readFile(join(home, '.gemini', 'config', 'hooks.json'), 'utf8'),
    );
    expect(leon.Stop[0].command).toBe(launcherCommand(home, 'antigravity', 'tour'));
    expect(run.output).toContain(
      `Antigravity found in ${join(home, '.gemini', 'antigravity-ide')}.`,
    );
    expect(run.output).toContain('Antigravity: hooks installed');
    expect((await factsConsent(home, 'antigravity'))?.capture_le).toBeInstanceOf(Date);
  });

  // ~/.gemini est aussi le dossier de Gemini CLI : sans dossier propre à Antigravity, rien n'est posé, même avec --yes.
  it('Gemini CLI seul : Antigravity n’est pas trouvé, ni crochet ni accord', async () => {
    await hasClaudeCode();
    await mkdir(join(home, '.gemini'));
    await writeFile(join(home, '.gemini', 'settings.json'), '{}');

    const run = await setup({ yes: true });

    expect(run.code).toBe(0);
    expect(run.output).toContain('Antigravity: not found');
    expect(await readdir(join(home, '.gemini'))).toEqual(['settings.json']);
    expect(await factsConsent(home, 'antigravity')).toBeNull();
  });

  it('Codex présent : son crochet de démarrage est posé et son accord écrit', async () => {
    await hasClaudeCode();
    await mkdir(join(home, '.codex'));

    const run = await setup({ yes: true });

    expect(run.code).toBe(0);
    const { hooks } = JSON.parse(await readFile(join(home, '.codex', 'hooks.json'), 'utf8'));
    expect(hooks.SessionStart[0].hooks[0].command).toBe(
      launcherCommand(home, 'codex', 'demarrage'),
    );
    expect(run.output).toContain('Codex: hooks installed (approve them with /hooks in Codex)');
  });

  it('CODEX_HOME remplace ~/.codex : c’est ce dossier qu’on cherche', async () => {
    const elsewhere = join(dir, 'codex-ailleurs');
    await mkdir(join(home, '.codex'));

    const absent = await setup({}, { env: { CODEX_HOME: elsewhere } });
    await mkdir(elsewhere);
    const present = await setup({}, { env: { CODEX_HOME: elsewhere }, answers: ['n'] });

    expect(absent.output).toContain('Codex: not found');
    expect(present.output).toContain('Codex: skipped (not confirmed)');
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
      '  Codex: hooks installed (approve them with /hooks in Codex)',
      '  Cursor: not found',
      '  Antigravity: not found',
      '',
      'To run Leon later: ~/.leon/bin/leon <command>',
      UPDATES,
    ]);
  });

  it('forme clone : ne parle pas de mises à jour automatiques (un clone se met à jour avec git)', async () => {
    await hasClaudeCode();

    const run = await setup({ yes: true, depot: clone });

    expect(run.output).toContain('To run Leon later: ~/.leon/bin/leon <command>');
    expect(run.output).not.toContain('updates itself');
    expect(run.output).not.toContain('update --previous');
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

// Les cases de la page « Autoriser » (T64, C16 du plan de la mémoire à disposition) : `leon setup` demande à `leon login`
// les usages cochés par défaut qui manquent sans refus aux outils trouvés, et passe ce que l'humain y tranche aux
// installateurs, qui l'écrivent après leur accord de base. Avec --yes, un ordinateur déjà connecté rouvre la page pour eux.
describe('setup : les cases de la page « Autoriser »', () => {
  beforeEach(installLeon);
  const RELAUNCH =
    'Usages of your coding tools are not chosen yet (such as reading Leon): opening the authorization page of Leon again, so that you choose them in your browser. This computer stays connected meanwhile.';
  const RELAUNCH_FAILED =
    'Nothing was chosen on the authorization page: this computer stays connected as before, and no usage was added. To choose them, run `~/.leon/bin/leon setup` again, or in a terminal. If this computer was connected with `leon login --with-token`, run that once more: `leon setup --yes` then stops opening the page.';
  const WITH_TOKEN =
    'This computer was connected with `leon login --with-token`: `leon setup --yes` does not open the authorization page. To choose the usages of your coding tools (such as reading Leon), run `~/.leon/bin/leon setup` in a terminal.';

  it('--yes sur un ordinateur non connecté : la case cochée s’écrit, aucune autre, sans question', async () => {
    await hasClaudeCode();

    const run = await setup({ yes: true }, { page: { usages: ['lecture'] } });

    expect(run.code).toBe(0);
    expect(run.asked).toEqual([{ usages: ['lecture'], relance: false }]);
    expect(run.questions).toEqual([]);
    expect(await factsConsent(home, 'claude_code')).toMatchObject({
      version: 2,
      usages: ['lecture'],
      refus: [],
    });
    expect(run.output).toContain('Reading Leon recorded');
  });

  it('--yes sur un ordinateur non connecté : la case décochée s’écrit en refus', async () => {
    await hasClaudeCode();

    await setup({ yes: true }, { page: { refus: ['lecture'] } });

    expect(await factsConsent(home, 'claude_code')).toMatchObject({
      usages: [],
      refus: ['lecture'],
    });
  });

  it('sans outil trouvé, ou quand tous ont tranché, aucune case n’est demandée', async () => {
    const none = await setup({ yes: true });
    expect(none.asked).toEqual([{ usages: [], relance: false }]);

    await hasClaudeCode();
    await writeConsent(home, 'claude_code', 2);
    await addRefusal(home, 'claude_code', 'lecture');
    await rm(join(home, '.leon', 'connexion.json'));
    const decided = await setup({ yes: true });
    expect(decided.asked).toEqual([{ usages: [], relance: false }]);
  });

  it('--yes sur un ordinateur connecté auquel manque lecture : relance login vers la connexion enregistrée, jamais LEON_URL', async () => {
    await connect();
    await hasClaudeCode();

    const run = await setup(
      { yes: true },
      {
        page: { usages: ['lecture'] },
        env: { LEON_URL: 'http://localhost:3000', LEON_TOKEN: `leon_${'y'.repeat(43)}` },
      },
    );

    expect(run.code).toBe(0);
    expect(run.logins).toEqual([CONNECTION.url]);
    expect(run.asked).toEqual([{ usages: ['lecture'], relance: true }]);
    expect(run.output).toContain(RELAUNCH);
    expect(await factsConsent(home, 'claude_code')).toMatchObject({ usages: ['lecture'] });
  });

  it('la relance reçoit le compte et l’espace de la connexion, lus par GET /api/v1/me avec son jeton ; la première connexion, aucun', async () => {
    await hasClaudeCode();
    const first = await setup({ yes: true });
    expect(first.attendus).toEqual([undefined]);

    const again = await setup({ yes: true });

    expect(again.asked).toEqual([{ usages: ['lecture'], relance: true }]);
    expect(again.attendus).toEqual([{ userId: PROFILE.userId, tenantId: PROFILE.tenantId }]);
    expect(again.requests[0]).toEqual({
      url: 'https://leon.example/api/v1/me',
      authorization: `Bearer ${FAKE_TOKEN}`,
    });
  });

  it('--url de la même origine : la relance vise ce serveur-là', async () => {
    await connect();
    await hasClaudeCode();

    const run = await setup({ yes: true, url: 'https://leon.example/' });

    expect(run.logins).toEqual([CONNECTION.url]);
    expect(run.asked).toEqual([{ usages: ['lecture'], relance: true }]);
  });

  it('un refus sur la page : pas de relance au setup --yes suivant', async () => {
    await connect();
    await hasClaudeCode();
    await setup({ yes: true }, { page: { refus: ['lecture'] } });

    const second = await setup({ yes: true });

    expect(second.logins).toEqual([]);
    expect(second.output).not.toContain(RELAUNCH);
    expect(await factsConsent(home, 'claude_code')).toMatchObject({ refus: ['lecture'] });
  });

  it('une relance en échec garde la connexion : les crochets sont posés, sans usage, et la ligne le dit', async () => {
    await connect();
    await hasClaudeCode();

    const run = await setup({ yes: true }, { loginCode: 1 });

    expect(run.code).toBe(0);
    expect(run.logins).toHaveLength(1);
    expect(run.output).toContain(RELAUNCH_FAILED);
    expect(await readConnection(home)).toEqual(CONNECTION);
    expect(await factsConsent(home, 'claude_code')).toMatchObject({
      version: 2,
      usages: [],
      refus: [],
    });
    expect(run.output).toContain('Claude Code: hooks installed');
  });

  it('une relance qui lève (écoute sur 127.0.0.1 refusée) garde la connexion : les crochets sont posés, sans usage', async () => {
    await connect();
    await hasClaudeCode();

    const run = await setup({ yes: true }, { loginThrows: true });

    expect(run.code).toBe(0);
    expect(run.output).toContain(RELAUNCH_FAILED);
    expect(run.output).toContain('Claude Code: hooks installed');
    expect(run.output).not.toContain('--with-token` instead');
    expect(await readConnection(home)).toEqual(CONNECTION);
    expect(await factsConsent(home, 'claude_code')).toMatchObject({
      version: 2,
      usages: [],
      refus: [],
    });
  });

  it.each([
    ['ne répond pas', 'unreachable' as const],
    ['répond 500', 500],
    ['rend un corps qui n’est pas un profil', 'malformed' as const],
  ])('pas de relance quand GET /api/v1/me %s', async (_name, me) => {
    await connect();
    await hasClaudeCode();

    const run = await setup({ yes: true }, { me });

    expect(run.logins).toEqual([]);
    expect(run.output).not.toContain(RELAUNCH);
  });

  it('sans --yes, pas de relance : dans un terminal, la question vient sur place', async () => {
    await connect();
    await hasClaudeCode();

    const run = await setup({}, { interactive: true, answers: ['y', '', 'n'] });

    expect(run.logins).toEqual([]);
    expect(await factsConsent(home, 'claude_code')).toMatchObject({
      usages: ['lecture'],
      refus: ['resume'],
    });
  });

  it('une case tranchée sur la page n’est pas redemandée dans le terminal du même passage', async () => {
    await hasClaudeCode();

    const run = await setup(
      {},
      { interactive: true, page: { refus: ['lecture'] }, answers: ['y', 'n'] },
    );

    expect(run.asked).toEqual([{ usages: ['lecture'], relance: false }]);
    expect(run.questions).toHaveLength(2);
    expect(run.questions.filter((question) => question.includes('[Y/n]'))).toEqual([]);
    expect(await factsConsent(home, 'claude_code')).toMatchObject({
      usages: [],
      refus: ['lecture', 'resume'],
    });
  });

  it('connexion par --with-token : pas de relance, une ligne sur la sortie', async () => {
    await writeConnection(home, { ...CONNECTION, par: 'jeton' });
    await hasClaudeCode();

    const run = await setup({ yes: true });

    expect(run.logins).toEqual([]);
    expect(run.output).toContain(WITH_TOKEN);
    expect(run.output).toContain('Claude Code: hooks installed');
  });

  it('lecture refusé dans Claude Code et Cursor nouveau : la page est demandée, lecture s’écrit pour Cursor seul', async () => {
    await connect();
    await hasClaudeCode();
    await setup({ yes: true });
    await addRefusal(home, 'claude_code', 'lecture');
    const claudeCode = await factsConsent(home, 'claude_code');
    await mkdir(join(home, '.cursor'));

    const run = await setup({ yes: true }, { page: { usages: ['lecture'] } });

    expect(run.asked).toEqual([{ usages: ['lecture'], relance: true }]);
    expect(await factsConsent(home, 'claude_code')).toEqual(claudeCode);
    expect(await factsConsent(home, 'cursor')).toMatchObject({ usages: ['lecture'], refus: [] });
  });

  it('rien ne s’écrit pour un outil dont l’accord de base n’est pas donné', async () => {
    await hasClaudeCode();

    const run = await setup({}, { page: { usages: ['lecture'] }, answers: ['n'] });

    expect(run.asked).toEqual([{ usages: ['lecture'], relance: false }]);
    expect(await exists(consentPath(home))).toBe(false);
  });

  it('un usage que setup n’a pas demandé n’est jamais écrit, même rendu par la page', async () => {
    await hasClaudeCode();

    await setup({ yes: true }, { page: { usages: ['lecture', 'resume'], refus: ['rappel'] } });

    expect(await factsConsent(home, 'claude_code')).toMatchObject({
      usages: ['lecture'],
      refus: [],
    });
  });
});

// Un retrait que le serveur n'a pas appris (fait avant la route, ou hors ligne) : `leon setup` le lui dit avant d'écrire
// un nouvel accord, qui effacerait son attente (T43).
describe('setup : un retrait que le serveur n’a pas appris', () => {
  beforeEach(async () => {
    await installLeon();
    await connect();
    await hasClaudeCode();
    await writeConsent(home, 'claude_code', 0);
  });

  it('le dit au serveur de la connexion avant d’écrire la version 2', async () => {
    const versions: number[] = [];

    const run = await setup(
      { yes: true },
      {
        whileFetching: async (url, init) => {
          if (!url.endsWith(API_PATHS.retrait)) return;
          const entry = JSON.parse(await readFile(consentPath(home), 'utf8')).outils.claude_code;
          // Avec la date de l'entrée en version 0 (T43, le retrait daté).
          expect(JSON.parse(String(init?.body))).toEqual({
            outil: 'claude_code',
            retire_le: entry.installe_le,
          });
          versions.push(entry.version);
        },
      },
    );

    expect(run.code).toBe(0);
    expect(run.requests).toContainEqual({
      url: `${CONNECTION.url}${API_PATHS.retrait}`,
      authorization: `Bearer ${FAKE_TOKEN}`,
    });
    expect(versions).toEqual([0]);
    expect((await factsConsent(home, 'claude_code'))?.version).toBe(2);
    expect(run.output).not.toContain(EARLIER_WITHDRAWAL_NOT_TOLD_MESSAGE);
  });

  it('un serveur qui ne l’apprend pas : une ligne, et l’installation continue', async () => {
    const run = await setup({ yes: true }, { me: 'unreachable' });

    expect(run.code).toBe(0);
    expect(run.output).toContain(EARLIER_WITHDRAWAL_NOT_TOLD_MESSAGE);
    expect(EARLIER_WITHDRAWAL_NOT_TOLD_MESSAGE).toBe(
      'Leon: the Leon server could not be told of an earlier withdrawal of your consent (no connection, server unreachable, older than this CLI, or token refused): if you give your consent again now, the sessions sent before that withdrawal keep, on that server, the usages you had accepted for them.',
    );
    expect((await factsConsent(home, 'claude_code'))?.version).toBe(2);
  });
});

describe('setup : relancé', () => {
  it('une seconde fois, ne pose aucune question et n’écrit rien', async () => {
    await installLeon();
    await hasClaudeCode();
    await mkdir(join(home, '.codex'));
    const first = await setup({}, { answers: ['y', 'y'] });
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
      `Your hooks used to run Leon from ${oldClone}; they now run ~/.leon/bin/leon. The token in ${oldClone}/.env.local is no longer needed: revoke it in Settings › Personal tokens.`,
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
