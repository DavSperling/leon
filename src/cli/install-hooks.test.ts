import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BRIEFING_STDIN_TIMEOUT_MS } from './briefing';
import { HOOK_DEADLINE_MS } from './capture-session';
import { writeConnection } from './connection';
import { addRefusal, addUsage, consentPath, factsConsent, writeConsent } from './consent';
import { hookCommand, launcherHookCommand } from './hook-commands';
import {
  addLeonHooks,
  BACKUP_FILE,
  installHooks,
  isLeonHandler,
  isYes,
  SESSION_END_TIMEOUT_S,
  SESSION_START_TIMEOUT_S,
  SETTINGS_FILE,
  type UsageDecisions,
} from './install-hooks';

// L'installateur des crochets (T14), toujours sur un dossier temporaire : jamais le vrai ~/.claude. Les crochets
// sont ceux de la doc officielle, https://code.claude.com/docs/en/hooks (voir l'en-tête d'install-hooks.ts).

const REPO = '/Users/amos/leon';
// Les commandes des crochets sont celles du lanceur ~/.leon/bin/leon (K9) du HOME temporaire, posées par beforeEach.
let START: string;
let END: string;
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
// Le dossier personnel d'exemple du README.
const README_HOME = '/Users/vous';

const leonStart = (command = START, timeout = 10) => ({
  hooks: [{ type: 'command', command, timeout }],
});
const leonEnd = (command = END, timeout = 30) => ({
  hooks: [{ type: 'command', command, timeout }],
});

// Un jeton de la forme attendue (API_TOKEN_PATTERN), fictif.
const FAKE_TOKEN = `leon_${'x'.repeat(43)}`;
const asRoot = process.getuid?.() === 0; // root passe outre les droits : les essais en lecture seule n'ont pas de sens

let dir: string;
let home: string;
let configDir: string;
let settingsPath: string;
let backupPath: string;
let locked: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'leon-install-hooks-'));
  home = join(dir, 'home'); // l'accord (consent.ts) s'écrit là : jamais dans le vrai ~/.leon
  START = launcherHookCommand(home, 'briefing');
  END = launcherHookCommand(home, 'capter-session');
  configDir = join(dir, 'claude');
  settingsPath = join(configDir, SETTINGS_FILE);
  backupPath = join(configDir, BACKUP_FILE);
  locked = [];
});

afterEach(async () => {
  // Un dossier en lecture seule ne se supprime pas : on lui rend ses droits d'abord.
  for (const path of locked) await chmod(path, 0o700);
  await rm(dir, { recursive: true, force: true });
});

// Un dépôt de Leon factice, avec ou sans `.env.local`.
async function fakeRepo(envLocal: string | null): Promise<string> {
  const repo = join(dir, 'depot');
  await mkdir(repo, { recursive: true });
  if (envLocal !== null) await writeFile(join(repo, '.env.local'), envLocal);
  return repo;
}

async function writeSettings(content: unknown): Promise<string> {
  const text = typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`;
  await mkdir(configDir, { recursive: true });
  await writeFile(settingsPath, text);
  return text;
}

const readSettings = async () => JSON.parse(await readFile(settingsPath, 'utf8'));
const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

type Run = { code: number; output: string; questions: string[] };

// `answers` : ce que « tape » l'utilisateur à chaque question (`null` : l'entrée se ferme, Ctrl+D) ; une question non
// prévue fait échouer le test.
// `repoDir` : le clone de la forme clone (REPO par défaut) ; `null`, la forme installée, qui n'a pas de clone.
// `interactive` : l'entrée est un terminal (faux par défaut, comme `echo oui | pnpm leon …`).
// `decisions` : les usages déjà tranchés dans le passage (`leon setup`, la page « Autoriser »).
async function install(
  options: {
    repoDir?: string | null;
    home?: string;
    assumeYes?: boolean;
    interactive?: boolean;
    decisions?: UsageDecisions;
    answers?: (string | null)[];
  } = {},
  hook?: () => Promise<void>,
): Promise<Run> {
  const lines: string[] = [];
  const questions: string[] = [];
  const answers = [...(options.answers ?? [])];
  const code = await installHooks(
    {
      repoDir: options.repoDir === null ? undefined : (options.repoDir ?? REPO),
      configDir,
      home: options.home ?? home,
      assumeYes: options.assumeYes ?? false,
      interactive: options.interactive ?? false,
      decisions: options.decisions,
    },
    {
      out: (text) => lines.push(text),
      err: (text) => lines.push(text),
      ask: async (question) => {
        questions.push(question);
        await hook?.();
        const answer = answers.shift();
        if (answer === undefined) throw new Error('question inattendue');
        return answer;
      },
    },
  );
  return { code, output: lines.join('\n'), questions };
}

describe('installHooks : écrire les deux crochets', () => {
  it('crée les réglages et le dossier s’ils n’existent pas, avec les commandes du lanceur (K9)', async () => {
    const run = await install({ assumeYes: true });

    expect(run.code).toBe(0);
    expect(await readSettings()).toEqual({
      hooks: { SessionStart: [leonStart()], SessionEnd: [leonEnd()] },
    });
    expect(START).toBe(`${home}/.leon/bin/leon briefing`);
    expect(END).toBe(`${home}/.leon/bin/leon capter-session`);
    // Ni le clone ni pnpm ne figurent dans les réglages : c'est le lanceur qui sait où est la CLI.
    expect(await readFile(settingsPath, 'utf8')).not.toContain('pnpm');
    expect(await readFile(settingsPath, 'utf8')).not.toContain(REPO);
    // Rien à sauvegarder : le fichier n'existait pas. Aucun fichier de travail ne reste.
    expect(await readdir(configDir)).toEqual([SETTINGS_FILE]);
  });

  it('pose les délais de la spec : 10 s au démarrage, 30 s à la fin', () => {
    expect(SESSION_START_TIMEOUT_S).toBe(10);
    expect(SESSION_END_TIMEOUT_S).toBe(30);
  });

  it('laisse à la commande de fin de session le temps de son envoi, sans dépasser le maximum de Claude Code', () => {
    expect(SESSION_END_TIMEOUT_S * 1000).toBeGreaterThan(HOOK_DEADLINE_MS);
    // « up to 60 seconds » (doc des crochets, SessionEnd)
    expect(SESSION_END_TIMEOUT_S).toBeLessThanOrEqual(60);
    // briefing.ts : lecture de l'entrée + git (3 s) + serveur (3 s) + démarrage, sous le délai du crochet.
    expect(SESSION_START_TIMEOUT_S * 1000).toBeGreaterThanOrEqual(
      BRIEFING_STDIN_TIMEOUT_MS + 3000 + 3000 + 500,
    );
  });

  it('garde les autres réglages et les autres crochets, dans leur ordre', async () => {
    const other = { type: 'command', command: 'echo bonjour' };
    const before = {
      theme: 'dark',
      env: { FOO: 'bar' },
      permissions: { allow: ['Bash(git status:*)'], deny: [] },
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: './garde.sh' }] }],
        SessionStart: [{ matcher: 'startup', hooks: [other] }],
        Stop: [{ hooks: [{ type: 'command', command: 'say fini' }] }],
      },
    };
    await writeSettings(before);

    const run = await install({ assumeYes: true });

    expect(run.code).toBe(0);
    const after = await readSettings();
    expect(after).toEqual({
      ...before,
      hooks: {
        ...before.hooks,
        SessionStart: [...before.hooks.SessionStart, leonStart()],
        SessionEnd: [leonEnd()],
      },
    });
    expect(Object.keys(after)).toEqual(['theme', 'env', 'permissions', 'hooks']);
    expect(Object.keys(after.hooks)).toEqual(['PreToolUse', 'SessionStart', 'Stop', 'SessionEnd']);
  });

  it('garde la copie de l’ancien fichier dans settings.json.leon-sauvegarde, octet pour octet', async () => {
    const original = await writeSettings('{\n    "theme": "dark"\n}\n');

    await install({ assumeYes: true });

    expect(backupPath).toBe(join(configDir, 'settings.json.leon-sauvegarde'));
    expect(await readFile(backupPath, 'utf8')).toBe(original);
    expect((await readSettings()).theme).toBe('dark');
    expect((await readdir(configDir)).sort()).toEqual([SETTINGS_FILE, BACKUP_FILE]);
  });

  it('ne rend pas la sauvegarde lisible par d’autres que le fichier d’origine (elle peut porter des clés)', async () => {
    await writeSettings({ env: { UNE_CLE: 'fictive' } });
    await chmod(settingsPath, 0o600);

    await install({ assumeYes: true });

    expect((await stat(backupPath)).mode & 0o777).toBe(0o600);
  });

  it('garde les droits du fichier d’origine, et ferme un fichier neuf aux autres', async () => {
    await writeSettings({ theme: 'dark' });
    await chmod(settingsPath, 0o664);
    await install({ assumeYes: true });
    expect((await stat(settingsPath)).mode & 0o777).toBe(0o664);

    await rm(configDir, { recursive: true });
    await install({ assumeYes: true });
    expect((await stat(settingsPath)).mode & 0o777).toBe(0o600);
  });

  it('écrit à travers un lien symbolique, qui reste un lien', async () => {
    const real = join(dir, 'dotfiles', 'claude-settings.json');
    await mkdir(join(dir, 'dotfiles'), { recursive: true });
    await writeFile(real, '{"theme":"dark"}\n');
    await mkdir(configDir, { recursive: true });
    await symlink(real, settingsPath);

    const run = await install({ assumeYes: true });

    expect(run.code).toBe(0);
    expect(JSON.parse(await readFile(real, 'utf8'))).toMatchObject({
      theme: 'dark',
      hooks: { SessionStart: [leonStart()] },
    });
    // Le lien est resté un lien : le fichier du dépôt de réglages de l'utilisateur a été mis à jour, pas remplacé.
    expect((await lstat(settingsPath)).isSymbolicLink()).toBe(true);
    expect(await readFile(settingsPath, 'utf8')).toBe(await readFile(real, 'utf8'));
    expect(await readdir(join(dir, 'dotfiles'))).toEqual(['claude-settings.json']);
    expect(await readFile(backupPath, 'utf8')).toBe('{"theme":"dark"}\n');
  });

  it('prend un fichier de réglages vide pour des réglages vides', async () => {
    await writeSettings('  \n');

    const run = await install({ assumeYes: true });

    expect(run.code).toBe(0);
    expect(await readSettings()).toEqual({
      hooks: { SessionStart: [leonStart()], SessionEnd: [leonEnd()] },
    });
  });

  it('cite proprement un dossier personnel avec espace et apostrophe, qu’un shell couperait', async () => {
    const odd = join(dir, 'Mes projets', "l'équipe");

    await install({ home: odd, assumeYes: true });

    const { hooks } = await readSettings();
    const start = hooks.SessionStart[0].hooks[0].command;
    expect(start).toBe(launcherHookCommand(odd, 'briefing'));
    expect(start).toBe(`'${join(odd, '.leon', 'bin', 'leon').replaceAll("'", "'\\''")}' briefing`);
    expect(hooks.SessionEnd[0].hooks[0].command).toBe(launcherHookCommand(odd, 'capter-session'));
    // Reconnu au passage suivant : rien n'est ajouté.
    expect((await install({ home: odd, assumeYes: true })).output).toContain('already in place');
  });
});

describe('installHooks : un second passage', () => {
  it('ne duplique rien, ne réécrit rien et ne touche pas à la sauvegarde', async () => {
    const original = await writeSettings({ theme: 'dark' });
    await install({ assumeYes: true });
    const afterFirst = await readFile(settingsPath, 'utf8');

    const run = await install({ assumeYes: true });

    expect(run.code).toBe(0);
    expect(run.output).toContain('already');
    expect(await readFile(settingsPath, 'utf8')).toBe(afterFirst);
    // La sauvegarde garde l'état d'avant la première installation, pas celui d'avant la seconde.
    expect(await readFile(backupPath, 'utf8')).toBe(original);
    const { hooks } = await readSettings();
    expect(hooks.SessionStart).toHaveLength(1);
    expect(hooks.SessionEnd).toHaveLength(1);
  });

  it('garde la sauvegarde d’avant Leon quand un ancien crochet pnpm passe à la forme du lanceur (la mise à jour ne l’écrase pas)', async () => {
    const original = await writeSettings({ theme: 'dark' });
    await install({ assumeYes: true });
    await writeSettings({
      theme: 'dark',
      hooks: {
        SessionStart: [leonStart(hookCommand('/ancien/leon', 'briefing'))],
        SessionEnd: [leonEnd(hookCommand('/ancien/leon', 'capter-session'))],
      },
    });
    expect(await readFile(settingsPath, 'utf8')).toContain('/ancien/leon');

    const run = await install({ assumeYes: true });

    expect(run.code).toBe(0);
    expect(run.output).toContain('update');
    expect(await readFile(settingsPath, 'utf8')).toContain(START);
    expect(await readFile(settingsPath, 'utf8')).not.toContain('/ancien/leon');
    // Remettre la sauvegarde retire bien Leon : elle ne contient aucun de ses crochets.
    expect(await readFile(backupPath, 'utf8')).toBe(original);
    expect(await readFile(backupPath, 'utf8')).not.toContain('leon');
  });

  it('ne remplace jamais une sauvegarde qui existe déjà, et le dit avant d’écrire', async () => {
    await writeSettings({ theme: 'dark' });
    await writeFile(backupPath, '{"theme":"ancienne-copie"}\n');

    const run = await install({ answers: ['oui'] });

    expect(run.code).toBe(0);
    expect(await readFile(backupPath, 'utf8')).toBe('{"theme":"ancienne-copie"}\n');
    expect(run.output).toContain('already exists');
    expect(run.output).not.toContain('the old file is copied');
    expect((await readSettings()).hooks.SessionStart).toEqual([leonStart()]);
  });

  it('ne demande rien quand tout est déjà en place', async () => {
    await install({ assumeYes: true });

    const run = await install({ answers: [] });

    expect(run.code).toBe(0);
    expect(run.questions).toEqual([]);
  });

  it('remplace sur place un ancien crochet pnpm par celui du lanceur, sans en ajouter un second', async () => {
    const other = { type: 'command', command: 'echo bonjour' };
    await writeSettings({
      hooks: {
        SessionStart: [{ hooks: [other] }, leonStart(hookCommand('/old/leon', 'briefing'))],
        SessionEnd: [leonEnd(hookCommand('/old/leon', 'capter-session'))],
      },
    });

    const run = await install({ assumeYes: true });

    expect(run.code).toBe(0);
    expect(run.output).toContain('update');
    expect((await readSettings()).hooks).toEqual({
      SessionStart: [{ hooks: [other] }, leonStart()],
      SessionEnd: [leonEnd()],
    });
  });

  it('reconnaît le crochet copié du README d’avant, ainsi que ses doublons, et n’en garde qu’un', async () => {
    const oldBriefing = 'pnpm -s --dir /vieux/chemin/leon leon briefing';
    const other = { type: 'command', command: 'echo bonjour' };
    await writeSettings({
      hooks: {
        SessionStart: [
          { hooks: [{ type: 'command', command: oldBriefing, timeout: 3, statusMessage: 'Leon' }] },
          {
            matcher: 'startup',
            hooks: [
              other,
              { type: 'command', command: oldBriefing },
              { type: 'command', command: 'pnpm --dir ~/leon leon briefing' },
              { type: 'command', command: `pnpm -s --dir "$HOME/Mes projets/leon" leon briefing` },
            ],
          },
        ],
      },
    });

    await install({ assumeYes: true });

    expect((await readSettings()).hooks.SessionStart).toEqual([
      leonStart(),
      { matcher: 'startup', hooks: [other] },
    ]);
  });

  it('retire un groupe que le retrait des doublons a vidé', async () => {
    const old = 'pnpm -s --dir /vieux/chemin/leon leon briefing';
    await writeSettings({
      hooks: {
        SessionStart: [
          { hooks: [{ type: 'command', command: old }] },
          { hooks: [{ type: 'command', command: old }] },
        ],
      },
    });

    await install({ assumeYes: true });

    expect((await readSettings()).hooks.SessionStart).toEqual([leonStart()]);
  });

  it('ne prend pas pour un crochet de Leon la commande d’un autre outil, ni celle de l’autre évènement', async () => {
    const mine = [
      'echo pnpm leon briefing',
      'pnpm run autre-chose',
      'pnpm run build && echo leon briefing',
      'cd /x && pnpm leon briefing; rm -rf /tmp/rien',
      'pnpm -s --dir /x leon briefing && rm -rf /tmp/rien',
      'pnpm -s --dir /x leon briefing; echo $(date)',
      'pnpm exec leon briefing',
      `pnpm -s --dir ${REPO} leon capter-session`,
    ].map((command) => ({ type: 'command', command }));
    await writeSettings({ hooks: { SessionStart: [{ hooks: mine }] } });

    await install({ assumeYes: true });

    const { hooks } = await readSettings();
    // Le crochet « capter-session » rangé sous SessionStart par l'utilisateur n'est pas touché.
    expect(hooks.SessionStart).toEqual([{ hooks: mine }, leonStart()]);
    expect(hooks.SessionEnd).toEqual([leonEnd()]);
  });
});

// Les installations d'avant le lanceur (S11) : des crochets `pnpm … --dir <clone> leon briefing|capter-session`, un jeton
// dans le `.env.local` du clone et, souvent, l'accord déjà en version 2. `leon setup` (forme installée) les remplace par
// ceux du lanceur (K9), sans rien demander de plus que l'écriture des réglages.
describe('installHooks : migrer les crochets pnpm d’avant le lanceur', () => {
  const OLD_CLONE = '/Users/amos/leon';
  const oldStart = (clone = OLD_CLONE, timeout = 10) => ({
    type: 'command',
    command: hookCommand(clone, 'briefing'),
    timeout,
  });
  const oldEnd = (clone = OLD_CLONE, timeout = 30) => ({
    type: 'command',
    command: hookCommand(clone, 'capter-session'),
    timeout,
  });
  const yours = [
    { type: 'command', command: 'echo avant' },
    { type: 'command', command: 'echo entre', timeout: 5, statusMessage: 'Un instant' },
    { type: 'command', command: 'echo après' },
  ];
  const handler = (command: string, timeout: number) => ({ type: 'command', command, timeout });

  // Des réglages d'avant : un crochet de l'utilisateur dans le groupe, un autre entre les deux évènements de Leon.
  const oldSettings = () => ({
    theme: 'dark',
    hooks: {
      SessionStart: [
        { matcher: 'startup', hooks: [yours[0], oldStart(), yours[1]] },
        { hooks: [yours[2]] },
      ],
      PreToolUse: [{ matcher: 'Bash', hooks: [yours[1]] }],
      SessionEnd: [{ hooks: [yours[0]] }, { matcher: '', hooks: [oldEnd(), yours[2]] }],
    },
  });

  it('remplace les deux crochets sur place : même groupe, même position, mêmes délais ; ceux de l’utilisateur ne bougent pas', async () => {
    await writeSettings(oldSettings());

    const run = await install({ repoDir: null, assumeYes: true });

    expect(run.code).toBe(0);
    const settings = await readSettings();
    expect(Object.keys(settings.hooks)).toEqual(['SessionStart', 'PreToolUse', 'SessionEnd']);
    expect(settings).toEqual({
      theme: 'dark',
      hooks: {
        SessionStart: [
          { matcher: 'startup', hooks: [yours[0], handler(START, 10), yours[1]] },
          { hooks: [yours[2]] },
        ],
        PreToolUse: [{ matcher: 'Bash', hooks: [yours[1]] }],
        SessionEnd: [{ hooks: [yours[0]] }, { matcher: '', hooks: [handler(END, 30), yours[2]] }],
      },
    });
    expect(JSON.stringify(settings)).not.toMatch(/pnpm/);
  });

  it('un doublon séparé du crochet par un crochet de l’utilisateur disparaît, le crochet de l’utilisateur reste', async () => {
    await writeSettings({
      hooks: {
        SessionStart: [{ hooks: [oldStart(), yours[1], oldStart('/Users/amos/autre-clone')] }],
      },
    });

    await install({ repoDir: null, assumeYes: true });

    expect((await readSettings()).hooks.SessionStart).toEqual([
      { hooks: [handler(START, 10), yours[1]] },
    ]);
  });

  it('deux passages donnent le même fichier, sans question ni message de migration au second', async () => {
    await writeSettings(oldSettings());
    const first = await install({ repoDir: null, assumeYes: true });
    const afterFirst = await readFile(settingsPath, 'utf8');

    const second = await install({ repoDir: null, answers: [] });

    expect(first.output).toContain('used to run Leon from');
    expect(second.code).toBe(0);
    expect(second.questions).toEqual([]);
    expect(second.output).not.toContain('used to run Leon');
    expect(await readFile(settingsPath, 'utf8')).toBe(afterFirst);
  });

  it('garde la sauvegarde d’avant Leon telle quelle (elle existe déjà), et le dit', async () => {
    await writeSettings(oldSettings());
    await writeFile(backupPath, '{"theme":"copie-d-avant-leon"}\n');

    const run = await install({ repoDir: null, answers: ['y'] });

    expect(run.code).toBe(0);
    expect(run.output).toContain('already exists');
    expect(await readFile(backupPath, 'utf8')).toBe('{"theme":"copie-d-avant-leon"}\n');
  });

  it('sans sauvegarde, copie une fois les réglages d’avant la migration, et ne la refait pas ensuite', async () => {
    const text = await writeSettings(oldSettings());

    await install({ repoDir: null, assumeYes: true });
    expect(await readFile(backupPath, 'utf8')).toBe(text);
    await writeSettings(oldSettings()); // des crochets pnpm de nouveau (Claude Code ou l’utilisateur a réécrit le fichier)
    await install({ repoDir: null, assumeYes: true });

    expect(await readFile(backupPath, 'utf8')).toBe(text);
  });

  describe('l’accord (~/.leon/accord.json)', () => {
    it('déjà en version 2 : gardé tel quel, octet pour octet, et rien n’est redemandé', async () => {
      await writeConsent(home, 'claude_code', 2, new Date('2026-10-20T08:00:00.000Z'));
      const consent = await readFile(consentPath(home), 'utf8');
      await writeSettings(oldSettings());

      const run = await install({ repoDir: null, answers: ['y'] });

      expect(run.code).toBe(0);
      // Une seule question : écrire les réglages. L’accord n’est ni redemandé ni réécrit.
      expect(run.questions).toHaveLength(1);
      expect(run.questions[0]).not.toContain('consent');
      expect(run.output).not.toContain('Consent recorded');
      expect(await readFile(consentPath(home), 'utf8')).toBe(consent);
      expect(
        JSON.parse(await readFile(settingsPath, 'utf8')).hooks.SessionStart[0].hooks[1],
      ).toEqual(handler(START, 10));
    });

    it('avec --yes : aucune question, accord intact', async () => {
      await writeConsent(home, 'claude_code', 2, new Date('2026-10-20T08:00:00.000Z'));
      const consent = await readFile(consentPath(home), 'utf8');
      await writeSettings(oldSettings());

      const run = await install({ repoDir: null, assumeYes: true });

      expect(run.code).toBe(0);
      expect(run.questions).toEqual([]);
      expect(await readFile(consentPath(home), 'utf8')).toBe(consent);
    });

    it('plus récent que la version 2 : jamais rabaissé', async () => {
      await writeConsent(home, 'claude_code', 4, new Date('2026-10-20T08:00:00.000Z'));
      const consent = await readFile(consentPath(home), 'utf8');
      await writeSettings(oldSettings());

      await install({ repoDir: null, assumeYes: true });

      expect(await readFile(consentPath(home), 'utf8')).toBe(consent);
      expect((await factsConsent(home, 'claude_code'))?.version).toBe(4);
    });

    it('absent (crochets posés avant l’accord) : il est demandé avec les réglages, une seule fois', async () => {
      await writeSettings(oldSettings());

      const run = await install({ repoDir: null, answers: ['y'] });

      expect(run.questions).toHaveLength(1);
      expect(run.questions[0]).toContain(`record this consent in ${consentPath(home)}`);
      expect((await factsConsent(home, 'claude_code'))?.version).toBe(2);
    });
  });

  describe('le message sur le clone d’avant (forme installée)', () => {
    const notice = (clone: string) =>
      `Your hooks used to run Leon from ${clone}; they now run ~/.leon/bin/leon. The token in ${clone}/.env.local is no longer needed: revoke it in Settings › Personal tokens.`;

    it('dit le clone d’où les crochets lançaient Leon, mot pour mot, une fois les réglages écrits', async () => {
      await writeSettings(oldSettings());

      const run = await install({ repoDir: null, assumeYes: true });

      expect(run.output).toContain(notice(OLD_CLONE));
      expect(run.output.indexOf('Hooks installed in')).toBeLessThan(
        run.output.indexOf('used to run Leon'),
      );
    });

    it('ne le dit pas si l’utilisateur répond « non » : les crochets sont toujours ceux d’avant', async () => {
      const text = await writeSettings(oldSettings());

      const run = await install({ repoDir: null, answers: ['n'] });

      expect(run.output).not.toContain('used to run Leon');
      expect(await readFile(settingsPath, 'utf8')).toBe(text);
    });

    it('ne le dit pas quand rien n’est écrit (réglages illisibles)', async () => {
      await writeSettings('{ pas du json');

      const run = await install({ repoDir: null, assumeYes: true });

      expect(run.code).toBe(1);
      expect(run.output).not.toContain('used to run Leon');
    });

    it('ne le dit pas pour une première installation, ni pour des crochets déjà ceux du lanceur', async () => {
      const fresh = await install({ repoDir: null, assumeYes: true });
      await writeSettings({ hooks: { SessionStart: [leonStart('~/.leon/bin/leon briefing')] } });
      const launcher = await install({ repoDir: null, assumeYes: true });

      expect(fresh.output).not.toContain('used to run Leon');
      expect(launcher.output).not.toContain('used to run Leon');
    });

    it('ne le dit pas sous la forme clone : le .env.local du clone sert toujours', async () => {
      await writeSettings(oldSettings());

      const run = await install({ assumeYes: true });

      expect(run.output).not.toContain('used to run Leon');
      expect(run.output).not.toContain('no longer needed');
    });

    it.each([
      ['--dir <dossier>', 'pnpm -s --dir /Users/amos/leon leon briefing', '/Users/amos/leon'],
      ['--dir=<dossier>', 'pnpm -s --dir=/Users/amos/leon leon briefing', '/Users/amos/leon'],
      ['-C <dossier>', 'pnpm -C /Users/amos/leon leon briefing', '/Users/amos/leon'],
      [
        'les options du crochet d’avant',
        hookCommand('/Users/amos/leon', 'briefing'),
        '/Users/amos/leon',
      ],
      [
        'un dossier entre guillemets, avec une espace',
        'pnpm -s --dir "/Users/amos/Mes projets/leon" leon briefing',
        '/Users/amos/Mes projets/leon',
      ],
      [
        'un dossier entre apostrophes, avec une apostrophe',
        hookCommand("/Users/Léa O'Neil/leon", 'briefing'),
        "/Users/Léa O'Neil/leon",
      ],
      ['un dossier écrit avec ~', 'pnpm --dir ~/leon leon briefing', '~/leon'],
    ])('lit le clone dans %s', async (_name, command, clone) => {
      await writeSettings({ hooks: { SessionStart: [leonStart(command)] } });

      const run = await install({ repoDir: null, assumeYes: true });

      expect(run.output).toContain(notice(clone));
    });

    it('nomme chaque clone une fois quand les crochets venaient de plusieurs, au pluriel', async () => {
      await writeSettings({
        hooks: {
          SessionStart: [leonStart(hookCommand('/a/leon', 'briefing'))],
          SessionEnd: [
            leonEnd(hookCommand('/b/leon', 'capter-session')),
            leonEnd(hookCommand('/a/leon', 'capter-session')),
          ],
        },
      });

      const run = await install({ repoDir: null, assumeYes: true });

      expect(run.output).toContain(
        'Your hooks used to run Leon from /a/leon and /b/leon; they now run ~/.leon/bin/leon. The tokens in /a/leon/.env.local and /b/leon/.env.local are no longer needed: revoke them in Settings › Personal tokens.',
      );
    });

    it('sans --dir, ne cite aucun .env.local (le clone n’est pas connu)', async () => {
      await writeSettings({ hooks: { SessionStart: [leonStart('pnpm leon briefing')] } });

      const run = await install({ repoDir: null, assumeYes: true });

      expect(run.output).toContain(
        'Your hooks used to run Leon through pnpm; they now run ~/.leon/bin/leon.',
      );
      expect(run.output).not.toContain('.env.local');
    });

    it('ne lit ni ne recopie jamais le .env.local de ce clone, et ne le touche pas', async () => {
      const clone = join(dir, 'ancien-clone');
      await mkdir(clone, { recursive: true });
      const envLocal = `LEON_URL=https://leon.example\nLEON_TOKEN=${FAKE_TOKEN}\n`;
      await writeFile(join(clone, '.env.local'), envLocal, { mode: 0o640 });
      await writeSettings({
        hooks: {
          SessionStart: [leonStart(hookCommand(clone, 'briefing'))],
          SessionEnd: [leonEnd(hookCommand(clone, 'capter-session'))],
        },
      });

      const run = await install({ repoDir: null, assumeYes: true });

      expect(run.output).toContain(notice(clone));
      expect(run.output).not.toContain(FAKE_TOKEN);
      expect(run.output).not.toContain('leon.example');
      expect(await readFile(join(clone, '.env.local'), 'utf8')).toBe(envLocal);
      expect((await stat(join(clone, '.env.local'))).mode & 0o777).toBe(0o640);
      expect(await readFile(settingsPath, 'utf8')).not.toContain(FAKE_TOKEN);
    });
  });
});

describe('installHooks : la confirmation', () => {
  it('sans --oui, affiche ce qui sera écrit puis demande confirmation', async () => {
    await writeSettings({ theme: 'dark' });

    const run = await install({ answers: ['oui'] });

    expect(run.code).toBe(0);
    expect(run.questions).toHaveLength(1);
    expect(run.output).toContain(settingsPath);
    expect(run.output).toContain('SessionStart');
    expect(run.output).toContain('SessionEnd');
    expect(run.output).toContain(START);
    expect(run.output).toContain(END);
    expect(run.output).toContain('10 s');
    expect(run.output).toContain('30 s');
    expect(run.output).toContain(backupPath);
    expect(run.output).toContain('.env.local');
    expect(await readSettings()).toEqual({
      theme: 'dark',
      hooks: { SessionStart: [leonStart()], SessionEnd: [leonEnd()] },
    });
  });

  it('pose la question avec [y/N], et accepte encore o et oui', async () => {
    const asked = await install({ answers: ['n'] });
    expect(asked.questions).toHaveLength(1);
    expect(asked.questions[0]).toContain('[y/N]');
    expect(asked.questions[0]).not.toContain('[o/N]');

    for (const answer of ['y', 'yes', 'o', 'oui']) {
      await rm(configDir, { recursive: true, force: true });
      const run = await install({ answers: [answer] });
      expect(run.code).toBe(0);
      expect(await exists(settingsPath)).toBe(true);
    }
  });

  it('entrée « non » : rien n’est écrit, ni réglages ni sauvegarde', async () => {
    const original = await writeSettings({ theme: 'dark' });

    const run = await install({ answers: ['non'] });

    expect(run.code).toBe(0);
    expect(run.questions).toHaveLength(1);
    expect(run.output).toContain('Nothing was written');
    expect(await readFile(settingsPath, 'utf8')).toBe(original);
    expect(await readdir(configDir)).toEqual([SETTINGS_FILE]);
  });

  it('entrée « non » sur des réglages absents : rien n’est créé', async () => {
    await install({ answers: ['non'] });

    expect(await exists(configDir)).toBe(false);
  });

  it.each(['', '  ', 'n', 'N', 'peut-être', 'o non'])(
    'une réponse qui n’est pas un oui (%j) n’écrit rien',
    async (answer) => {
      const run = await install({ answers: [answer] });

      expect(run.code).toBe(0);
      expect(await exists(settingsPath)).toBe(false);
    },
  );

  it.each(['o', 'O', 'oui', 'Oui ', ' OUI\n', 'y', 'yes'])(
    'la réponse %j est un oui',
    async (answer) => {
      expect(isYes(answer)).toBe(true);
      const run = await install({ answers: [answer] });
      expect(await exists(settingsPath)).toBe(true);
      expect(run.code).toBe(0);
    },
  );

  it('avec --oui, ne pose aucune question mais dit ce qu’il écrit', async () => {
    const run = await install({ assumeYes: true });

    expect(run.questions).toEqual([]);
    expect(run.output).toContain(START);
    expect(run.output).toContain(END);
  });

  it('refuse d’écraser des réglages modifiés pendant que l’utilisateur réfléchissait', async () => {
    await writeSettings({ theme: 'dark' });
    const changed = '{"theme":"light","editorMode":"vim"}\n';

    const run = await install({ answers: ['oui'] }, () => writeFile(settingsPath, changed));

    expect(run.code).toBe(1);
    expect(run.output).toContain('changed during the installation');
    expect(await readFile(settingsPath, 'utf8')).toBe(changed);
    expect(await readdir(configDir)).toEqual([SETTINGS_FILE]);
  });

  it('refuse aussi si les réglages sont apparus pendant ce temps', async () => {
    const created = '{"theme":"light"}\n';

    const run = await install({ answers: ['oui'] }, () => writeSettings(created).then(() => {}));

    expect(run.code).toBe(1);
    expect(await readFile(settingsPath, 'utf8')).toBe(created);
  });
});

describe('installHooks : le texte du consentement', () => {
  it('dit que toutes les sessions, de tous les dossiers, partent chez Leon, y compris celles de `claude -p`', async () => {
    const run = await install({ answers: ['non'] });
    const lines = run.output.split('\n').join(' ');

    expect(lines).toContain('ALL your Claude Code sessions');
    expect(lines).toContain('ALL your folders');
    expect(lines).toContain('personal');
    // Une session lancée par un script est captée aussi (doc : « claude -p discovers and loads » les crochets) ;
    // seul --bare ne charge aucun crochet.
    expect(lines).toContain('claude -p');
    expect(lines).toContain('--bare');
  });

  it('dit ce que les commandes demandent à l’environnement de Claude Code : pnpm, node et la mise en page', async () => {
    const run = await install({ answers: ['non'] });
    const lines = run.output.split('\n').join(' ');

    expect(lines).toContain('PATH');
    expect(lines).toContain('pnpm');
    expect(lines).toContain('node');
    expect(lines).toContain('packageManager');
    expect(lines).toContain('formatting');
  });

  it('dit le dossier voulu avant d’écrire, même avec --oui', async () => {
    const run = await install({ assumeYes: true });

    expect(run.output).toContain('ALL your folders');
  });
});

// Le texte de l'accord, mot pour mot (plan mémoire des sessions, règle « Consentement ») : ce qui est lu, ce qui
// part, et ce qui est donné au modèle de Claude Code.
const CONSENT_TEXT = [
  'What will be sent: these hooks are in your personal settings, so they run in ALL your Claude Code sessions, in ALL your folders (personal ones included). Sessions started by a script (`claude -p`) run them too, except with `--bare`, which loads no hooks.',
  "  - At the end of each session, the Leon server receives the text of the exchanges (your messages and Claude's answers; the messages Claude Code adds in your place, such as a background task's result, the output of a `!` or `/` command, another session's message or a script's prompt, labeled as not typed by you; a `!` command you type is sent whole) and the actions of the session, read from its transcript: the files written (paths in the repository), the commands run (only their executable, plus the subcommand for a fixed list of developer tools such as git, gh, pnpm or docker; never their other arguments), Git (branch, commits, pull requests), the task list, and a few markers (start and end times, number of messages and tool errors, whether the session used the web, an MCP server, a subagent or a network command).",
  '  - Secrets are masked before sending, and again by the server. Each session stays private to its author.',
  "  - At the start of each session, the server receives the project key, the current Git branch and the session id. It sends back your recent sessions on this repository (their branch, pull requests, commits, files and remaining tasks) and the project's morning briefing: Claude Code adds this block to the session context, so it is given to Claude Code's model.",
].join('\n');

const leonHooksInPlace = () =>
  writeSettings({ theme: 'dark', hooks: { SessionStart: [leonStart()], SessionEnd: [leonEnd()] } });

describe('installHooks : l’accord (~/.leon/accord.json)', () => {
  it('montre mot pour mot ce qui part et ce qui est donné au modèle de Claude Code', async () => {
    const asked = await install({ answers: ['non'] });
    const forced = await install({ assumeYes: true });

    expect(asked.output).toContain(CONSENT_TEXT);
    expect(forced.output).toContain(CONSENT_TEXT);
  });

  it('après la confirmation, écrit l’accord de Claude Code en version 2, en 0600', async () => {
    const run = await install({ answers: ['oui'] });

    expect(run.code).toBe(0);
    expect(run.questions[0]).toContain(consentPath(home));
    const written = JSON.parse(await readFile(consentPath(home), 'utf8'));
    expect(written).toEqual({
      outils: { claude_code: { version: 2, installe_le: expect.any(String) } },
    });
    expect(Number.isNaN(Date.parse(written.outils.claude_code.installe_le))).toBe(false);
    expect((await stat(consentPath(home))).mode & 0o777).toBe(0o600);
    expect(run.output).toContain(`Consent recorded in ${consentPath(home)}`);
  });

  it('sur « non », n’écrit pas l’accord', async () => {
    await install({ answers: ['non'] });

    expect(await exists(consentPath(home))).toBe(false);
  });

  it('crochets en place, sans accord, réponse « oui » : accord en version 2, réglages inchangés', async () => {
    const before = await leonHooksInPlace();

    const run = await install({ answers: ['oui'] });

    expect(run.code).toBe(0);
    expect(run.questions).toHaveLength(1);
    expect(run.output).toContain(CONSENT_TEXT);
    expect((await factsConsent(home, 'claude_code'))?.version).toBe(2);
    expect(await readFile(settingsPath, 'utf8')).toBe(before);
    // Ni sauvegarde ni fichier de travail : settings.json n'est pas touché.
    expect(await readdir(configDir)).toEqual([SETTINGS_FILE]);
  });

  it('crochets en place, accord plus ancien, réponse « non » : rien n’est écrit', async () => {
    const before = await leonHooksInPlace();
    await writeConsent(home, 'claude_code', 1);
    const consentBefore = await readFile(consentPath(home), 'utf8');

    const run = await install({ answers: ['non'] });

    expect(run.code).toBe(0);
    expect(run.questions).toHaveLength(1);
    // Ce qui part sans accord, borné à la fin de session : la phrase ne promet rien du démarrage (briefing.ts).
    expect(run.output).toContain(
      'Nothing was written: at the end of each session, the hooks keep sending only the text of the exchanges, not its actions.',
    );
    expect(await readFile(consentPath(home), 'utf8')).toBe(consentBefore);
    expect(await readFile(settingsPath, 'utf8')).toBe(before);
  });

  it('crochets en place, accord retiré, réponse « non » : dit que rien ne part, mot pour mot', async () => {
    await leonHooksInPlace();
    await writeConsent(home, 'claude_code', 0);
    const consentBefore = await readFile(consentPath(home), 'utf8');

    const run = await install({ answers: ['non'] });

    expect(run.code).toBe(0);
    expect(run.output).toContain(
      `Both Leon hooks are already in place in ${settingsPath}, but your consent was withdrawn: for now, they send nothing.`,
    );
    expect(run.output).toContain('Nothing was written: the hooks keep sending nothing.');
    expect(run.output).not.toContain('only the text of the exchanges');
    expect(await readFile(consentPath(home), 'utf8')).toBe(consentBefore);
  });

  it('après l’écriture, donne la commande de retrait', async () => {
    const run = await install({ assumeYes: true });

    expect(run.output).toContain(
      'To remove them, run `pnpm leon retirer-crochets` (it also withdraws your consent).',
    );
  });

  it('crochets en place, sans accord, avec --oui : écrit l’accord sans rien demander', async () => {
    await leonHooksInPlace();

    const run = await install({ assumeYes: true });

    expect(run.questions).toEqual([]);
    expect(run.output).toContain(CONSENT_TEXT);
    expect((await factsConsent(home, 'claude_code'))?.version).toBe(2);
  });

  it('ne rabaisse jamais un accord plus récent', async () => {
    await writeConsent(home, 'claude_code', 3);

    await install({ assumeYes: true });

    expect((await factsConsent(home, 'claude_code'))?.version).toBe(3);
  });

  it('un accord qui ne s’écrit pas : message clair et code 1, les crochets restent en place', async () => {
    // Un fichier à la place du dossier personnel : la création de ~/.leon échoue, même pour root.
    home = join(dir, 'home-fichier');
    await writeFile(home, '');
    START = launcherHookCommand(home, 'briefing');

    const run = await install({ assumeYes: true });

    expect(run.code).toBe(1);
    expect(run.output).toContain(`could not write ${consentPath(home)}`);
    expect(run.output).toContain('only the text of the exchanges');
    expect((await readSettings()).hooks.SessionStart).toEqual([leonStart()]);
  });
});

// L'usage `resume` (C7 révisé, D30 du plan de la mémoire à disposition), mot pour mot : demandé à part, après l'accord
// de base, jamais coché d'avance, jamais donné par --oui ni par une réponse lue hors d'un terminal.
const RESUME_TEXT = [
  'Session summaries (usage "resume", optional, asked separately):',
  "  - A summary of each session is written by Leon's model provider: once a session with at least 6 of your messages has ended, the Leon server sends its actions, the state of its pull requests and the end of its exchanges (40,000 characters at most, secrets already masked) to Leon's model provider, which writes the summary. If the session goes on later, a new summary replaces the old one.",
  "  - The summary stays private to you, like the session. Leon's search finds it; it is never added to the context of a new session. Withdrawing your consent stops new summaries: it tells the Leon server this computer is connected to (only that server and account: one this computer used before is not told). If this computer is offline then, a summary already planned may still be written within an hour, and Leon later tells the server this computer is connected to by then: at the next session start of a tool that keeps its hooks, or when you run the withdrawal again.",
  "  - The same usage also keeps the state of your work threads up to date (a thread gathers the sessions, pull requests and sources about one piece of work): the Leon server sends to Leon's model provider the actions, exchanges and summaries of your sessions that have this usage, the state of their pull requests and the sources linked to the thread that you can see, and the provider writes that state. It stays private to you, like the summary. Withdrawing your consent stops this too, once the Leon server is told.",
].join('\n');

// Après un refus, la ligne fixe qui dit comment revenir dessus (C7 révisé, A16), avec la commande de la forme de Leon :
// le clone par défaut ici. Le retrait dit lui-même comment redonner l'accord (CONSENT_AGAIN_HINT).
const refusedLine = (leon = 'pnpm leon') =>
  `This answer is kept: you will not be asked again. To change it, run \`${leon} retirer-crochets\` (it also removes the hooks and withdraws your consent), then give your consent again as that command explains.`;
const REFUSED_LINE = refusedLine();
const resumeQuestion = () =>
  `\nAlso let Leon's model provider write a summary of each session and keep the state of your work threads up to date (recorded in ${consentPath(home)})? [y/N] `;

// L'usage `lecture` (C7 révisé, D24, D30, A16 ; décisions d'Amos du 11/11), mot pour mot : un seul texte, sans nom
// d'outil, le même pour les quatre installateurs et pour la page « Autoriser » (T64). Demandé à part, après l'accord de
// base et avant `resume`, coché par défaut : [Y/n] dans un terminal.
const LECTURE_TEXT = [
  'Reading Leon (usage "lecture", asked separately):',
  "  - At the start of each session or conversation, Leon places in the agent's context the summary of your work threads on this repository (keys only: their id, branch, tools, dates, pull request numbers and states, number of linked sources), which replaces the list of your recent sessions, the lessons you accepted, and an instruction to read the thread of its task. The model provider of the tool sees them.",
  '  - The agent can read your work threads on this repository, their summaries and their state, and the memory of this repository that you can see, with the commands `leon threads`, `leon thread`, `leon search` and `leon versions`, or with the tools `threads`, `thread` and `versions` if the Leon MCP server is connected to the tool. The model provider of the tool sees what it reads. This usage never lets an agent write anything to Leon.',
  '  - The `leon` commands use the token of this computer: once one of your code tools accepts this usage, they work for every agent on this computer. Refusing it in a tool only removes, in that tool, the summary, the lessons and the instruction placed at the start.',
].join('\n');
const lectureQuestion = () =>
  `\nLet the agents of the code tools set up now read Leon this way (recorded in ${consentPath(home)})? [Y/n] `;
const LECTURE_NONE =
  'Nothing was added: Leon places no summary of your threads at the start of a session.';
// Une réponse qui ne tranche pas `lecture` : ni usage ni refus, la question revient au passage suivant.
const SANS_REPONSE = 'plus tard';

describe('installHooks : l’usage lecture', () => {
  const rawEntry = async () =>
    JSON.parse(await readFile(consentPath(home), 'utf8')).outils.claude_code;

  it('montre son texte mot pour mot après l’accord de base et avant resume, en [Y/n] ; Entrée l’accepte, daté', async () => {
    const run = await install({ interactive: true, answers: ['oui', '', 'non'] });

    expect(run.code).toBe(0);
    expect(run.questions).toEqual([expect.any(String), lectureQuestion(), resumeQuestion()]);
    expect(run.output.indexOf(LECTURE_TEXT)).toBeGreaterThan(run.output.indexOf(CONSENT_TEXT));
    expect(run.output.indexOf(RESUME_TEXT)).toBeGreaterThan(run.output.indexOf(LECTURE_TEXT));
    expect(run.output).toContain(`Reading Leon recorded in ${consentPath(home)}.`);
    expect(await rawEntry()).toEqual({
      version: 2,
      installe_le: expect.any(String),
      usages: { lecture: expect.any(String) },
      refus: { resume: expect.any(String) },
    });
  });

  it.each(['', 'y', 'yes', 'o', 'oui', ' Oui '])('la réponse %j l’accepte', async (answer) => {
    await install({ interactive: true, answers: ['oui', answer, null] });

    expect(await rawEntry()).toEqual({
      version: 2,
      installe_le: expect.any(String),
      usages: { lecture: expect.any(String) },
    });
  });

  it.each(['n', 'no', 'non', 'NON'])(
    'la réponse %j est un refus, daté, suivi de la ligne qui dit comment revenir dessus',
    async (answer) => {
      const run = await install({ interactive: true, answers: ['oui', answer, null] });

      expect(run.output).toContain(LECTURE_NONE);
      expect(run.output).toContain(REFUSED_LINE);
      expect(await rawEntry()).toEqual({
        version: 2,
        installe_le: expect.any(String),
        refus: { lecture: expect.any(String) },
      });
    },
  );

  // Décision d'Amos du 11/11 : une faute de frappe ne vaut ni accord ni refus (un refus est gardé jusqu'au retrait).
  it.each([SANS_REPONSE, 'peut-être', null])(
    'la réponse %j n’écrit rien, et la question revient au passage suivant',
    async (answer) => {
      const run = await install({ interactive: true, answers: ['oui', answer, null] });

      expect(run.code).toBe(0);
      expect(run.output).toContain(LECTURE_NONE);
      expect(run.output).not.toContain('This answer is kept');
      expect(await rawEntry()).toEqual({ version: 2, installe_le: expect.any(String) });

      const again = await install({ interactive: true, answers: ['', null] });

      expect(again.questions[0]).toBe(lectureQuestion());
      expect((await factsConsent(home, 'claude_code'))?.usages).toEqual(['lecture']);
    },
  );

  it('hors terminal, ni texte ni question : Entrée ou « y » lus d’un tube n’en donnent aucun', async () => {
    const run = await install({ answers: ['oui', '', 'y'] });

    expect(run.questions).toHaveLength(1);
    expect(run.output).not.toContain(LECTURE_TEXT);
    expect(await rawEntry()).toEqual({ version: 2, installe_le: expect.any(String) });
  });

  it('refusé, puis resume accepté : chacun est gardé à part', async () => {
    await install({ interactive: true, answers: ['oui', 'non', 'oui'] });

    expect(await factsConsent(home, 'claude_code')).toMatchObject({
      usages: ['resume'],
      refus: ['lecture'],
    });
  });

  it('accepté, puis resume refusé : chacun est gardé à part', async () => {
    await install({ interactive: true, answers: ['oui', 'oui', 'non'] });

    expect(await factsConsent(home, 'claude_code')).toMatchObject({
      usages: ['lecture'],
      refus: ['resume'],
    });
  });

  it.skipIf(asRoot)(
    'accepté mais pas écrit : message clair et code 1, et resume n’est pas demandé',
    async () => {
      await leonHooksInPlace();
      await writeConsent(home, 'claude_code', 2);
      const consentBefore = await readFile(consentPath(home), 'utf8');
      await chmod(join(home, '.leon'), 0o500);
      locked.push(join(home, '.leon'));

      const run = await install({ interactive: true, answers: [''] });

      expect(run.code).toBe(1);
      expect(run.questions).toEqual([lectureQuestion()]);
      expect(run.output).toContain(
        `could not write ${consentPath(home)} (EACCES): Leon places no summary of your threads at the start of a session. Run the command again.`,
      );
      expect(await readFile(consentPath(home), 'utf8')).toBe(consentBefore);
    },
  );
});

// Le mécanisme de la page « Autoriser » (T64) et de `leon setup` (décision d'Amos du 11/11) : les usages tranchés dans
// le passage arrivent à l'installateur, qui les écrit après son accord de base sans redemander, là où l'usage manque
// sans refus.
describe('installHooks : les usages tranchés dans le passage', () => {
  const rawEntry = async () =>
    JSON.parse(await readFile(consentPath(home), 'utf8')).outils.claude_code;

  it('une décision s’écrit sans question, même avec --oui : celle de la page, que l’humain a cochée', async () => {
    const run = await install({
      assumeYes: true,
      decisions: new Map([
        ['lecture', true],
        ['resume', false],
      ]),
    });

    expect(run.code).toBe(0);
    expect(run.questions).toEqual([]);
    expect(run.output).not.toContain(LECTURE_TEXT);
    expect(run.output).toContain(REFUSED_LINE);
    expect(await factsConsent(home, 'claude_code')).toMatchObject({
      usages: ['lecture'],
      refus: ['resume'],
    });
  });

  it('une réponse du terminal va dans les décisions, pour les outils suivants du passage', async () => {
    const decisions: UsageDecisions = new Map();

    await install({ interactive: true, decisions, answers: ['oui', '', null] });

    expect([...decisions]).toEqual([
      ['lecture', true],
      ['resume', null],
    ]);
  });

  it('demandé sans réponse dans le passage : ni redemandé, ni écrit', async () => {
    const run = await install({
      interactive: true,
      decisions: new Map([['lecture', null]]),
      answers: ['oui', null],
    });

    expect(run.questions).toEqual([expect.any(String), resumeQuestion()]);
    expect(await rawEntry()).toEqual({ version: 2, installe_le: expect.any(String) });
  });

  it('une décision ne remplace jamais un refus, ni un usage déjà là', async () => {
    await leonHooksInPlace();
    await writeConsent(home, 'claude_code', 2);
    await addRefusal(home, 'claude_code', 'lecture');
    await addUsage(home, 'claude_code', 'resume');
    const consentBefore = await readFile(consentPath(home), 'utf8');

    const run = await install({
      assumeYes: true,
      decisions: new Map([
        ['lecture', true],
        ['resume', false],
      ]),
    });

    expect(run.output).toContain('nothing to do');
    expect(await readFile(consentPath(home), 'utf8')).toBe(consentBefore);
  });

  it('l’accord de base refusé : aucune décision n’est écrite', async () => {
    const run = await install({
      decisions: new Map([['lecture', true]]),
      answers: ['non'],
    });

    expect(run.code).toBe(0);
    expect(await exists(consentPath(home))).toBe(false);
  });
});

describe('installHooks : l’usage resume', () => {
  const usages = async () => (await factsConsent(home, 'claude_code'))?.usages;
  const refus = async () => (await factsConsent(home, 'claude_code'))?.refus;
  const rawEntry = async () =>
    JSON.parse(await readFile(consentPath(home), 'utf8')).outils.claude_code;

  it('montre son texte mot pour mot après l’accord de base, puis le demande à part, en [y/N]', async () => {
    const run = await install({ interactive: true, answers: ['oui', SANS_REPONSE, 'non'] });

    expect(run.code).toBe(0);
    expect(run.questions).toHaveLength(3);
    expect(run.questions[2]).toBe(resumeQuestion());
    expect(run.output.indexOf(RESUME_TEXT)).toBeGreaterThan(run.output.indexOf(CONSENT_TEXT));
    expect(run.output).toContain('Nothing was added: no session is summarized.');
    expect(run.output).toContain(REFUSED_LINE);
    expect(await usages()).toEqual([]);
    expect(await refus()).toEqual(['resume']);
  });

  it('accepté : l’usage s’ajoute, daté, à l’accord en version 2', async () => {
    const run = await install({ interactive: true, answers: ['oui', SANS_REPONSE, 'oui'] });

    expect(run.code).toBe(0);
    expect(JSON.parse(await readFile(consentPath(home), 'utf8'))).toEqual({
      outils: {
        claude_code: {
          version: 2,
          installe_le: expect.any(String),
          usages: { resume: expect.any(String) },
        },
      },
    });
    expect(run.output).toContain(`Session summaries recorded in ${consentPath(home)}.`);
  });

  // Forme installée : rien de Leon dans le PATH, la commande passe par le lanceur.
  it('refusé sous la forme installée : la commande du retrait passe par le lanceur', async () => {
    const run = await install({
      repoDir: null,
      interactive: true,
      answers: ['oui', SANS_REPONSE, 'non'],
    });

    expect(run.output).toContain(refusedLine('~/.leon/bin/leon'));
  });

  it.each(['', 'n', 'peut-être'])(
    'la réponse %j n’ajoute aucun usage, et le refus s’écrit, daté',
    async (answer) => {
      await install({ interactive: true, answers: ['oui', SANS_REPONSE, answer] });

      expect(await usages()).toEqual([]);
      expect((await rawEntry()).refus).toEqual({ resume: expect.any(String) });
    },
  );

  // D30 : une entrée fermée (Ctrl+D) n'est pas une réponse. Rien n'est gardé, la question reviendra.
  it('l’entrée fermée : ni usage ni refus, et la question revient au passage suivant', async () => {
    const run = await install({ interactive: true, answers: ['oui', SANS_REPONSE, null] });

    expect(run.code).toBe(0);
    expect(run.output).toContain('Nothing was added: no session is summarized.');
    expect(run.output).not.toContain('This answer is kept');
    expect(await rawEntry()).toEqual({ version: 2, installe_le: expect.any(String) });

    // `lecture`, laissé sans réponse lui aussi, revient avec elle.
    const again = await install({ interactive: true, answers: [SANS_REPONSE, 'non'] });

    expect(again.questions).toEqual([lectureQuestion(), resumeQuestion()]);
    expect(await refus()).toEqual(['resume']);
  });

  // `lecture` refusé lui aussi : plus rien n'est à proposer, « nothing to do » revient.
  it('refusé : plus jamais proposé, ni par installer-crochets ni par un nouveau passage', async () => {
    await install({ interactive: true, answers: ['oui', 'non', 'non'] });
    const consentBefore = await readFile(consentPath(home), 'utf8');

    const run = await install({ interactive: true, answers: [] });

    expect(run.code).toBe(0);
    expect(run.questions).toEqual([]);
    expect(run.output).toContain('nothing to do');
    expect(run.output).not.toContain(RESUME_TEXT);
    expect(run.output).not.toContain(LECTURE_TEXT);
    expect(await readFile(consentPath(home), 'utf8')).toBe(consentBefore);
  });

  it('hors terminal, il n’est pas demandé : une réponse lue d’un tube n’en donne aucun', async () => {
    const run = await install({ answers: ['oui', 'oui'] });

    expect(run.questions).toHaveLength(1);
    expect(run.output).not.toContain(RESUME_TEXT);
    expect(run.output).not.toContain(LECTURE_TEXT);
    expect(await rawEntry()).toEqual({ version: 2, installe_le: expect.any(String) });
  });

  it('avec --oui, ni question ni usage ni refus, même dans un terminal', async () => {
    const run = await install({ interactive: true, assumeYes: true });

    expect(run.questions).toEqual([]);
    expect(run.output).not.toContain(LECTURE_TEXT);
    expect(await rawEntry()).toEqual({ version: 2, installe_le: expect.any(String) });
  });

  // Une réinstallation (les crochets d'avant remplacés sur place) garde l'accord tel quel : ni usage ni refus perdus.
  it('des crochets d’avant remplacés sous un accord en version 2 : ses usages et ses refus restent', async () => {
    await writeSettings({
      hooks: {
        SessionStart: [leonStart(hookCommand('/ancien/leon', 'briefing'))],
        SessionEnd: [leonEnd(hookCommand('/ancien/leon', 'capter-session'))],
      },
    });
    await writeConsent(home, 'claude_code', 2);
    await addUsage(home, 'claude_code', 'lecture');
    await addRefusal(home, 'claude_code', 'resume');
    const consentBefore = await readFile(consentPath(home), 'utf8');

    const run = await install({ interactive: true, answers: ['oui'] });

    expect(run.code).toBe(0);
    expect(run.questions).toHaveLength(1);
    expect(await readFile(settingsPath, 'utf8')).not.toContain('/ancien/leon');
    expect(await readFile(consentPath(home), 'utf8')).toBe(consentBefore);
  });

  it('l’accord de base refusé : l’usage n’est pas demandé', async () => {
    const run = await install({ interactive: true, answers: ['non'] });

    expect(run.questions).toHaveLength(1);
    expect(await exists(consentPath(home))).toBe(false);
  });

  it('crochets et accord en place, sans usage : lecture puis resume proposés, settings.json n’est pas touché', async () => {
    const before = await leonHooksInPlace();
    await writeConsent(home, 'claude_code', 2, new Date('2026-11-02T14:00:00Z'));

    const run = await install({ interactive: true, answers: [SANS_REPONSE, 'oui'] });

    expect(run.code).toBe(0);
    expect(run.questions).toEqual([lectureQuestion(), resumeQuestion()]);
    expect(run.output).toContain(`Both Leon hooks are already in place in ${settingsPath}.`);
    expect(run.output).not.toContain('nothing to do');
    expect(run.output).toContain(LECTURE_TEXT);
    expect(run.output).toContain(RESUME_TEXT);
    // La date de l'accord, qui borne le rattrapage, ne bouge pas.
    expect(await factsConsent(home, 'claude_code')).toEqual({
      version: 2,
      installe_le: new Date('2026-11-02T14:00:00Z'),
      usages: ['resume'],
      usages_le: { resume: expect.any(Date) },
      refus: [],
    });
    expect(await readFile(settingsPath, 'utf8')).toBe(before);
    expect(await readdir(configDir)).toEqual([SETTINGS_FILE]);
  });

  it('crochets en place sans accord : l’accord de base, puis l’usage', async () => {
    await leonHooksInPlace();

    const run = await install({ interactive: true, answers: ['oui', SANS_REPONSE, 'oui'] });

    expect(run.questions).toHaveLength(3);
    expect(await factsConsent(home, 'claude_code')).toMatchObject({
      version: 2,
      usages: ['resume'],
    });
  });

  it('tout en place, les usages compris : rien n’est demandé', async () => {
    await leonHooksInPlace();
    await writeConsent(home, 'claude_code', 2);
    await install({ interactive: true, answers: ['oui', 'oui'] });

    const run = await install({ interactive: true, answers: [] });

    expect(run.code).toBe(0);
    expect(run.questions).toEqual([]);
    expect(run.output).toContain('nothing to do');
  });

  it.skipIf(asRoot)(
    'un usage qui ne s’écrit pas : message clair et code 1, l’accord de base gardé',
    async () => {
      await leonHooksInPlace();
      await writeConsent(home, 'claude_code', 2);
      const consentBefore = await readFile(consentPath(home), 'utf8');
      await chmod(join(home, '.leon'), 0o500);
      locked.push(join(home, '.leon'));

      const run = await install({ interactive: true, answers: [SANS_REPONSE, 'oui'] });

      expect(run.code).toBe(1);
      expect(run.output).toContain(`could not write ${consentPath(home)}`);
      expect(run.output).toContain('no session is summarized');
      expect(await readFile(consentPath(home), 'utf8')).toBe(consentBefore);
    },
  );

  it.skipIf(asRoot)(
    'un refus qui ne s’écrit pas : code 0, la question reviendra, l’accord de base gardé',
    async () => {
      await leonHooksInPlace();
      await writeConsent(home, 'claude_code', 2);
      const consentBefore = await readFile(consentPath(home), 'utf8');
      await chmod(join(home, '.leon'), 0o500);
      locked.push(join(home, '.leon'));

      const run = await install({ interactive: true, answers: [SANS_REPONSE, 'non'] });

      expect(run.code).toBe(0);
      expect(run.output).toContain('the question will come back');
      expect(run.output).not.toContain(REFUSED_LINE);
      expect(await readFile(consentPath(home), 'utf8')).toBe(consentBefore);
    },
  );
});

describe('installHooks : les réglages du serveur dans le .env.local du dépôt', () => {
  it('prévient « pas connecté » et dit de lancer leon login quand rien ne donne le serveur', async () => {
    const repoDir = await fakeRepo(null);

    const run = await install({ repoDir, assumeYes: true });

    expect(run.output).toContain('This computer is not connected: run `~/.leon/bin/leon login`');
  });

  it('ne prévient pas quand l’ordinateur est connecté (leon login), même sans .env.local', async () => {
    const repoDir = await fakeRepo(null);
    await writeConnection(home, {
      url: 'https://leon.example',
      jeton: FAKE_TOKEN,
      ordinateur: 'MacBook-Pro',
      espace: 'Acme',
      cree_le: '2026-11-03T10:00:00.000Z',
    });

    const run = await install({ repoDir, assumeYes: true });

    expect(run.code).toBe(0);
    expect(run.output).not.toContain('Warning');
    expect(run.output).not.toContain('is missing');
    // L'aperçu dit d'où viendra le serveur, sans en recopier ni l'adresse ni le jeton.
    expect(run.output).toContain('leon login');
    expect(run.output).not.toContain(FAKE_TOKEN);
    expect(run.output).not.toContain('leon.example');
  });

  it('prévient quand le dépôt n’a pas de .env.local : les commandes ne feraient rien', async () => {
    const repoDir = await fakeRepo(null);

    const run = await install({ repoDir, assumeYes: true });

    expect(run.code).toBe(0);
    expect(run.output).toContain('LEON_URL is missing');
    expect(run.output).toContain('LEON_TOKEN is missing');
    expect(run.output).toContain(join(repoDir, '.env.local'));
    expect(run.output).toContain('stderr');
    // Un simple avertissement : les crochets sont écrits quand même.
    expect(await exists(settingsPath)).toBe(true);
  });

  it('ne prévient pas quand LEON_URL et LEON_TOKEN sont réglés (même avec « export » et des guillemets)', async () => {
    const repoDir = await fakeRepo(
      `# réglages\nexport LEON_URL="http://localhost:3000"\nLEON_TOKEN='${FAKE_TOKEN}'\n`,
    );

    const run = await install({ repoDir, assumeYes: true });

    expect(run.code).toBe(0);
    expect(run.output).not.toContain('is missing');
    expect(run.output).not.toContain('Warning');
  });

  it.each([
    [
      'des clés vides',
      'LEON_URL=\nLEON_TOKEN=\n',
      ['LEON_URL is missing', 'LEON_TOKEN is missing'],
    ],
    ['seul le jeton absent', 'LEON_URL=http://localhost:3000\n', ['LEON_TOKEN is missing']],
    [
      'un jeton qui n’a pas la forme voulue',
      'LEON_URL=http://localhost:3000\nLEON_TOKEN=pas-un-jeton\n',
      ['LEON_TOKEN is missing or invalid'],
    ],
    [
      'une adresse en http hors de la machine',
      `LEON_URL=http://leon.exemple.test\nLEON_TOKEN=${FAKE_TOKEN}\n`,
      ['LEON_URL is missing or invalid'],
    ],
  ])('prévient avec %s', async (_name, envLocal, expected) => {
    const repoDir = await fakeRepo(envLocal);

    const run = await install({ repoDir, assumeYes: true });

    for (const text of expected) expect(run.output).toContain(text);
    if (!expected.some((text) => text.startsWith('LEON_URL'))) {
      expect(run.output).not.toContain('LEON_URL is missing');
    }
  });

  it('n’affiche jamais une valeur du fichier, ni dans l’aperçu ni dans l’avertissement', async () => {
    const repoDir = await fakeRepo(
      'LEON_URL=http://adresse-secrete.exemple.test\nLEON_TOKEN=jeton-secret-0123456789\nAUTRE=valeur-secrete\n',
    );

    const run = await install({ repoDir, assumeYes: true });

    expect(run.output).toContain('is missing');
    for (const secret of ['adresse-secrete', 'jeton-secret', 'valeur-secrete']) {
      expect(run.output).not.toContain(secret);
    }
  });

  it('prévient aussi quand les crochets sont déjà en place', async () => {
    const repoDir = await fakeRepo(null);
    await install({ repoDir, assumeYes: true });

    const run = await install({ repoDir, assumeYes: true });

    expect(run.output).toContain('already in place');
    expect(run.output).toContain('LEON_TOKEN is missing');
  });
});

describe('installHooks : une écriture qui échoue', () => {
  it.skipIf(asRoot)(
    'dossier en lecture seule : message clair, rien de modifié, ni réglages ni copie',
    async () => {
      const original = await writeSettings({ theme: 'dark' });
      await chmod(configDir, 0o500);
      locked.push(configDir);

      const run = await install({ assumeYes: true });

      expect(run.code).toBe(1);
      expect(run.output).toContain(`could not write ${settingsPath}`);
      expect(run.output).toContain('permissions or disk space');
      expect(run.output).toContain('Nothing was modified');
      expect(run.output).toContain('by hand');
      // Pas le message brut du système.
      expect(run.output).not.toContain('copyfile');
      expect(await readFile(settingsPath, 'utf8')).toBe(original);
      expect(await readdir(configDir)).toEqual([SETTINGS_FILE]);
      // Sans crochets écrits, l'accord ne l'est pas non plus.
      expect(await exists(consentPath(home))).toBe(false);
    },
  );

  it.skipIf(asRoot)(
    'dossier de réglages impossible à créer : même message, rien de créé',
    async () => {
      const parent = join(dir, 'parent-ferme');
      await mkdir(parent);
      await chmod(parent, 0o500);
      locked.push(parent);

      const lines: string[] = [];
      const code = await installHooks(
        { repoDir: REPO, configDir: join(parent, 'claude'), home, assumeYes: true },
        {
          out: (text) => lines.push(text),
          err: (text) => lines.push(text),
          ask: async () => '',
        },
      );

      expect(code).toBe(1);
      expect(lines.join('\n')).toContain('could not write');
      expect(await readdir(parent)).toEqual([]);
    },
  );

  it.skipIf(asRoot)(
    'la copie réussit mais l’écriture échoue : la copie faite pour rien est retirée',
    async () => {
      // Le fichier est un lien vers un dossier de réglages en lecture seule : la sauvegarde (à côté du lien) s'écrit,
      // le fichier de travail (à côté du vrai fichier) non.
      const dotfiles = join(dir, 'dotfiles');
      const real = join(dotfiles, 'claude-settings.json');
      await mkdir(dotfiles, { recursive: true });
      await writeFile(real, '{"theme":"dark"}\n');
      await mkdir(configDir, { recursive: true });
      await symlink(real, settingsPath);
      await chmod(dotfiles, 0o500);
      locked.push(dotfiles);

      const run = await install({ assumeYes: true });

      expect(run.code).toBe(1);
      expect(run.output).toContain('could not write');
      expect(await readFile(real, 'utf8')).toBe('{"theme":"dark"}\n');
      expect(await readdir(configDir)).toEqual([SETTINGS_FILE]);
    },
  );

  it('un lien symbolique qui ne mène nulle part n’est pas « absent » : aucune écriture', async () => {
    await mkdir(configDir, { recursive: true });
    const missing = join(dir, 'dotfiles-non-montes', 'settings.json');
    await symlink(missing, settingsPath);

    const run = await install({ assumeYes: true });

    expect(run.code).toBe(1);
    expect(run.output).toContain('unreadable');
    expect(run.output).toContain('Nothing was written');
    expect((await lstat(settingsPath)).isSymbolicLink()).toBe(true);
    expect(await exists(join(dir, 'dotfiles-non-montes'))).toBe(false);
    expect(await readdir(configDir)).toEqual([SETTINGS_FILE]);
  });
});

describe('installHooks : des réglages qu’on ne sait pas lire', () => {
  const unreadable = [
    ['du JSON coupé', '{ "theme": '],
    [
      'du JSON avec un commentaire (Claude Code lit du JSON strict)',
      '{\n// mon thème\n"theme": "dark"}',
    ],
    ['du JSON avec une virgule finale', '{"theme": "dark",}'],
    ['du texte', 'bonjour'],
    ['un tableau', '[]'],
    ['null', 'null'],
    ['une chaîne', '"x"'],
  ] as const;

  it.each(unreadable)('%s : aucune écriture, message clair', async (_name, text) => {
    await writeSettings(text);

    const run = await install({ assumeYes: true });

    expect(run.code).toBe(1);
    expect(run.output).toContain(settingsPath);
    expect(run.output).toContain('unreadable');
    expect(run.output).toContain('Nothing was written');
    // Le contenu du fichier n'est jamais recopié dans le message.
    expect(run.output).not.toContain('mon thème');
    expect(await readFile(settingsPath, 'utf8')).toBe(text);
    expect(await readdir(configDir)).toEqual([SETTINGS_FILE]);
  });

  it('ne pose pas de question avant d’avoir lu les réglages', async () => {
    await writeSettings('{ "theme": ');

    const run = await install({ answers: [] });

    expect(run.code).toBe(1);
    expect(run.questions).toEqual([]);
  });

  it('un dossier à la place du fichier : aucune écriture', async () => {
    await mkdir(settingsPath, { recursive: true });

    const run = await install({ assumeYes: true });

    expect(run.code).toBe(1);
    expect(run.output).toContain('unreadable');
    expect((await stat(settingsPath)).isDirectory()).toBe(true);
  });

  const badShapes = [
    ['« hooks » n’est pas un objet', { hooks: [] }],
    ['« hooks » est du texte', { hooks: 'non' }],
    ['SessionStart n’est pas une liste', { hooks: { SessionStart: 'non' } }],
    ['SessionEnd est un objet', { hooks: { SessionEnd: {} } }],
    ['un groupe n’est pas un objet', { hooks: { SessionStart: ['non'] } }],
    ['un groupe n’a pas de liste « hooks »', { hooks: { SessionStart: [{ hooks: 'non' }] } }],
    ['un groupe de SessionEnd n’a pas de « hooks »', { hooks: { SessionEnd: [{ matcher: 'x' }] } }],
  ] as const;

  it.each(badShapes)('%s : aucune écriture, message clair', async (_name, settings) => {
    const text = await writeSettings(settings);

    const run = await install({ assumeYes: true });

    expect(run.code).toBe(1);
    expect(run.output).toContain('expected shape');
    expect(run.output).toContain('Nothing was written');
    expect(await readFile(settingsPath, 'utf8')).toBe(text);
    expect(await readdir(configDir)).toEqual([SETTINGS_FILE]);
  });

  it('une forme inattendue sur un autre évènement n’empêche pas l’installation', async () => {
    await writeSettings({ hooks: { PreToolUse: 'à la main', Stop: [{ hooks: [42, 'x'] }] } });

    const run = await install({ assumeYes: true });

    expect(run.code).toBe(0);
    const { hooks } = await readSettings();
    expect(hooks.PreToolUse).toBe('à la main');
    expect(hooks.Stop).toEqual([{ hooks: [42, 'x'] }]);
    expect(hooks.SessionStart).toEqual([leonStart()]);
  });
});

describe('installHooks : les avertissements', () => {
  it('prévient quand « disableAllHooks » éteindrait les crochets', async () => {
    await writeSettings({ disableAllHooks: true });

    const run = await install({ assumeYes: true });

    expect(run.code).toBe(0);
    expect(run.output).toContain('disableAllHooks');
    expect((await readSettings()).disableAllHooks).toBe(true);
  });

  it('ne prévient pas sans raison', async () => {
    await writeSettings({ disableAllHooks: false });

    const run = await install({ assumeYes: true });

    expect(run.output).not.toContain('disableAllHooks');
  });

  it('prévient quand le dépôt est un worktree Git temporaire', async () => {
    const run = await install({
      repoDir: '/Users/amos/leon/.claude/worktrees/une-tache',
      assumeYes: true,
    });

    expect(run.code).toBe(0);
    expect(run.output).toContain('temporary Git worktree');
    expect(run.output).toContain('--depot');
  });

  it('ne prévient pas pour le clone principal', async () => {
    const run = await install({ assumeYes: true });

    expect(run.output).not.toContain('temporary');
  });
});

// La forme installée n'a pas de clone (`repoDir` absent) : le lanceur lance le Node posé par Leon, donc ni pnpm ni
// `.env.local` ne sont en jeu. La forme clone (`installer-crochets`) garde ses avertissements.
describe('installHooks : la forme installée, sans clone', () => {
  it('écrit les mêmes commandes du lanceur que la forme clone', async () => {
    const installed = await install({ repoDir: null, assumeYes: true });
    const installedSettings = await readFile(settingsPath, 'utf8');
    await rm(configDir, { recursive: true, force: true });
    await install({ assumeYes: true });

    expect(installed.code).toBe(0);
    expect(installedSettings).toBe(await readFile(settingsPath, 'utf8'));
  });

  it('n’annonce ni pnpm ni Node dans le PATH de Claude Code, et ne cite aucun .env.local', async () => {
    const run = await install({ repoDir: null, answers: ['non'] });
    const lines = run.output.split('\n').join(' ');

    expect(lines).not.toContain('packageManager');
    expect(lines).not.toContain('node` 24');
    expect(lines).not.toContain('.env.local');
    // Le reste du texte d'accord est inchangé.
    expect(lines).toContain('ALL your Claude Code sessions');
    expect(lines).toContain('formatting');
  });

  it('prévient « pas connecté » sans nommer de fichier du clone, et se tait quand l’ordinateur est connecté', async () => {
    const notConnected = await install({ repoDir: null, assumeYes: true });
    await rm(configDir, { recursive: true, force: true });
    await writeConnection(home, {
      url: 'https://leon.example',
      jeton: FAKE_TOKEN,
      ordinateur: 'MacBook-Pro',
      espace: 'Acme',
      cree_le: '2026-11-03T10:00:00.000Z',
    });

    const connected = await install({ repoDir: null, assumeYes: true });

    expect(notConnected.output).toContain(
      'This computer is not connected: run `~/.leon/bin/leon login`',
    );
    expect(notConnected.output).not.toContain('.env.local');
    expect(connected.output).not.toContain('Warning');
  });

  it('ne prévient pas du worktree, qu’il n’y a pas', async () => {
    const run = await install({ repoDir: null, assumeYes: true });

    expect(run.output).not.toContain('temporary');
  });

  it('donne la commande de retrait du lanceur ; la forme clone garde celle de pnpm', async () => {
    const installed = await install({ repoDir: null, assumeYes: true });
    await rm(configDir, { recursive: true, force: true });
    const clone = await install({ assumeYes: true });

    expect(installed.output).toContain(
      'To remove them, run `~/.leon/bin/leon retirer-crochets` (it also withdraws your consent).',
    );
    expect(clone.output).toContain('To remove them, run `pnpm leon retirer-crochets`');
  });
});

describe('isLeonHandler : la forme du lanceur (K9) et l’ancienne', () => {
  const handler = (command: string) => ({ type: 'command', command, timeout: 10 });

  it.each([
    ['le lanceur', launcherHookCommand('/Users/amos', 'briefing')],
    ['le lanceur entre apostrophes', "'/Users/Léa O Neil/.leon/bin/leon' briefing"],
    [
      'le lanceur avec une apostrophe dans le chemin',
      launcherHookCommand("/Users/Léa O'Neil", 'briefing'),
    ],
    ['le lanceur écrit avec ~', '~/.leon/bin/leon briefing'],
    ['le lanceur avec des espaces autour', '  /Users/amos/.leon/bin/leon briefing  '],
    ['la forme pnpm d’avant', hookCommand(REPO, 'briefing')],
  ])('reconnaît %s', (_name, command) => {
    expect(isLeonHandler(handler(command), 'briefing')).toBe(true);
  });

  it('reconnaît aussi la fin de session sous la forme du lanceur', () => {
    expect(
      isLeonHandler(
        handler(launcherHookCommand('/Users/amos', 'capter-session')),
        'capter-session',
      ),
    ).toBe(true);
    expect(
      isLeonHandler(handler(launcherHookCommand('/Users/amos', 'capter-session')), 'briefing'),
    ).toBe(false);
  });

  it.each([
    'echo /Users/amos/.leon/bin/leon briefing',
    '/Users/amos/.leon/bin/leon briefing && rm -rf /tmp/rien',
    '/Users/amos/.leon/bin/leon briefing; echo fini',
    '/Users/amos/.leon/bin/leon briefing --autre',
    '/Users/amos/.leon/bin/leon crochet claude-code fin',
    '/Users/amos/.leon/bin/autre briefing',
    '/Users/amos/.leon/bin/leon-vieux briefing',
    '/Users/amos/bin/leon briefing',
    '/Users/amos/.leon/bin/leon',
    "'/Users/amos/.leon/bin/leon briefing",
    'leon briefing',
  ])('ne reconnaît pas %j : c’est à l’utilisateur', (command) => {
    expect(isLeonHandler(handler(command), 'briefing')).toBe(false);
  });

  it('ne reconnaît pas un crochet qui n’a pas de commande', () => {
    expect(isLeonHandler({ type: 'command' }, 'briefing')).toBe(false);
    expect(isLeonHandler('briefing', 'briefing')).toBe(false);
  });
});

describe('addLeonHooks', () => {
  it('écrit les commandes du lanceur (K9) du dossier personnel reçu, entre apostrophes s’il le faut', () => {
    const { settings } = addLeonHooks({}, "/Users/Léa O'Neil");

    expect(settings).toEqual({
      hooks: {
        SessionStart: [leonStart("'/Users/Léa O'\\''Neil/.leon/bin/leon' briefing")],
        SessionEnd: [leonEnd("'/Users/Léa O'\\''Neil/.leon/bin/leon' capter-session")],
      },
    });
  });

  it('ne modifie pas l’objet reçu', () => {
    const settings = { hooks: { SessionStart: [{ hooks: [] }] } };
    const copy = structuredClone(settings);

    const result = addLeonHooks(settings, home);

    expect(settings).toEqual(copy);
    expect(result.changes.map((change) => change.action)).toEqual(['ajout', 'ajout']);
  });

  it('dit pour chaque évènement ce qu’il fait', () => {
    const first = addLeonHooks({}, home).settings;
    const again = addLeonHooks(first, home);
    const moved = addLeonHooks(first, '/ailleurs');

    expect(again.changes).toEqual([
      { event: 'SessionStart', action: 'inchange', command: START, timeout: 10 },
      { event: 'SessionEnd', action: 'inchange', command: END, timeout: 30 },
    ]);
    expect(moved.changes.map((change) => change.action)).toEqual(['mise-a-jour', 'mise-a-jour']);
    expect(again.settings).toEqual(first);
  });
});

describe('le README', () => {
  const readme = async () => readFile(`${REPO_ROOT}README.md`, 'utf8');

  // Ce que l'installateur écrit vraiment, pour un dossier personnel de test, avec le dossier d'exemple du README à sa
  // place : le README montre les commandes du lanceur (K9), plus la ligne pnpm d'avant.
  it('montre les crochets exactement comme l’installateur les écrit (K9)', async () => {
    await install({ repoDir: null, assumeYes: true });
    const written = (await readFile(settingsPath, 'utf8')).trimEnd().replaceAll(home, README_HOME);

    expect(written).toContain(launcherHookCommand(README_HOME, 'briefing'));
    expect(await readme()).toContain(written);
  });

  it('ne montre plus les crochets pnpm d’avant comme ce que l’installateur écrit', async () => {
    const text = await readme();

    expect(text).not.toContain('"command": "pnpm');
    expect(text).not.toContain('/chemin/vers/leon');
  });

  it('commence par la commande unique, puis la connexion, puis la forme clone des développeurs de Leon', async () => {
    const text = await readme();
    const section = text.slice(
      text.indexOf('### Installer'),
      text.indexOf('### Ce qui est envoyé'),
    );
    const order = [
      'curl -fsSL <adresse de Leon>/install | sh',
      '~/.leon/bin/leon login',
      '~/.leon/bin/leon logout',
      'pnpm leon setup --depot <clone>',
      'pnpm leon installer-crochets',
    ].map((marker) => section.indexOf(marker));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('garde la limite des machines partagées et le repli --with-token de la connexion', async () => {
    const text = await readme();

    expect(text).toContain('/proc/<pid>/cmdline');
    expect(text).toContain('--with-token');
    expect(text).toContain('Connected to <espace> as <compte>');
  });

  it('dit ce que fait la commande unique : ~/.leon seulement, ni PATH ni profil de shell, les plateformes', async () => {
    const text = await readme();

    expect(text).toContain('~/.leon');
    expect(text).toMatch(/rien dans votre `PATH` ni votre profil de shell/);
    // Elle écrit aussi les réglages des outils de code, après accord : « n'écrit rien d'autre » serait faux.
    expect(text).toContain(
      "n'écrit que là, plus les réglages de vos outils de code après votre accord",
    );
    expect(text).not.toContain("n'écrit rien d'autre");
    for (const platform of ['macOS', 'Linux']) expect(text).toContain(platform);
    expect(text).toContain('musl');
  });

  it('dit ce que le script vérifie : Node par son empreinte seulement, la CLI par sa taille et son empreinte', async () => {
    const text = await readme();

    expect(text).toContain(
      "vérifie l'empreinte SHA-256 de Node et la taille et l'empreinte SHA-256 de la CLI",
    );
  });

  it('a un paragraphe « Mises à jour » : au plus une fois par jour, depuis le serveur connecté, et --previous', async () => {
    const text = await readme();
    const section = text.slice(
      text.indexOf('#### Mises à jour'),
      text.indexOf('#### Ce que la commande écrit dans Claude Code'),
    );

    expect(section).not.toBe('');
    expect(section).toContain('au plus une fois par jour');
    expect(section).toContain('connexion.json');
    expect(section).toContain('~/.leon/bin/leon update --previous');
    expect(section).toContain("jusqu'à la mise à jour suivante (24 h)");
    expect(section).toContain('si le serveur sert toujours la même version');
    // Il fait partie de la section d'installation.
    expect(text.indexOf('### Installer')).toBeLessThan(text.indexOf('#### Mises à jour'));
    expect(text.indexOf('#### Mises à jour')).toBeLessThan(text.indexOf('### Ce qui est envoyé'));
  });

  it('explique la migration d’une installation d’avant : crochets remplacés, accord gardé, jeton du .env.local à révoquer', async () => {
    const text = await readme();
    const section = text.slice(
      text.indexOf('### Installer'),
      text.indexOf('### Ce qui est envoyé'),
    );

    expect(section).toContain('used to run Leon from');
    // Le jeton du .env.local a été créé à la main : il est sous « Personal tokens », pas sous « Connected computers ».
    expect(section).toContain('Settings › Personal tokens');
    expect(section).not.toContain('Connected computers');
    expect(section).toContain('.env.local');
    expect(section).toMatch(/jamais lu|ne lit jamais/);
  });

  it("a la section « L'IA à jour chaque matin » et plus l'ancienne", async () => {
    const text = await readme();

    expect(text).toContain("## L'IA à jour chaque matin");
    expect(text).not.toContain('Briefing au démarrage');
    expect(text).toContain('pnpm leon installer-crochets');
  });

  // La doc officielle (https://code.claude.com/docs/en/headless) : sans --bare, `claude -p` charge les crochets
  // de ~/.claude, et sur SIGTERM il exécute les crochets SessionEnd. Le texte de consentement ne doit pas
  // annoncer moins d'envois qu'il n'y en a.
  it('ne dit pas qu’une session `claude -p` échappe au crochet, et cite --bare', async () => {
    const text = await readme();
    const quand = text.split('\n').find((line) => line.startsWith('- **Quand**'));

    expect(quand).toBeDefined();
    expect(quand).toContain('claude -p');
    expect(quand).toContain('--bare');
    expect(quand).toContain('import-claude-code');
    expect(quand).not.toMatch(/ne sont pas capt/);
    expect(text).not.toMatch(/claude -p`[^.\n]*(?:pas|jamais) capt/);
    // Un plantage ou un terminal fermé de force : la doc n'en dit rien, le texte ne l'affirme pas.
    expect(quand).toMatch(/peu(?:t|vent) ne pas l.être/);
  });

  it('dit que toutes les sessions de tous les dossiers sont envoyées, et que Claude Code attend l’approbation du dossier', async () => {
    const text = await readme();

    expect(text).toContain('toutes vos sessions Claude Code');
    expect(text).toContain('tous vos dossiers');
    expect(text).toMatch(/approuv/);
    expect(text).toContain('PATH');
  });

  it('dit que la sauvegarde est la première copie, que la mise en page peut changer et que le projet n’est pas touché', async () => {
    const text = await readme();

    expect(text).not.toContain("est la copie d'avant l'installation");
    expect(text).toContain('première copie');
    expect(text).toContain('mise en page');
    expect(text).toContain('réglages du projet');
  });

  it('dit où vit l’accord, ce qu’il permet, et ce qui est donné au modèle de Claude Code', async () => {
    const text = await readme();

    expect(text).toContain('~/.leon/accord.json');
    expect(text).toContain('sans toucher à `settings.json`');
    expect(text).toContain('modèle de Claude Code');
  });

  it('le commentaire de briefing.ts décrit le crochet du lanceur, pas la ligne pnpm', async () => {
    const source = await readFile(`${REPO_ROOT}src/cli/briefing.ts`, 'utf8');

    expect(source).toContain('launcherHookCommand');
    expect(source).not.toContain('Le crochet lance `hookCommand(');
  });

  it('le commentaire de capture-session.ts ne dit pas non plus que `claude -p` échappe au crochet', async () => {
    const source = await readFile(`${REPO_ROOT}src/cli/capture-session.ts`, 'utf8');

    expect(source).not.toContain('ne sont jamais captés');
    expect(source).toContain('--bare');
  });
});
