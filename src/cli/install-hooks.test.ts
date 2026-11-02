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
import { consentPath, factsConsent, writeConsent } from './consent';
import {
  addLeonHooks,
  BACKUP_FILE,
  installHooks,
  isYes,
  SESSION_END_TIMEOUT_S,
  SESSION_START_TIMEOUT_S,
  SETTINGS_FILE,
} from './install-hooks';

// L'installateur des crochets (T14), toujours sur un dossier temporaire : jamais le vrai ~/.claude. Les crochets
// sont ceux de la doc officielle, https://code.claude.com/docs/en/hooks (voir l'en-tête d'install-hooks.ts).

const REPO = '/Users/amos/leon';
const START = `pnpm -s --config.verify-deps-before-run=false --dir ${REPO} leon briefing`;
const END = `pnpm -s --config.verify-deps-before-run=false --dir ${REPO} leon capter-session`;
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
// Le chemin d'exemple du README.
const README_REPO = '/chemin/vers/leon';

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

// `answers` : ce que « tape » l'utilisateur à chaque question ; une question non prévue fait échouer le test.
async function install(
  options: { repoDir?: string; assumeYes?: boolean; answers?: string[] } = {},
  hook?: () => Promise<void>,
): Promise<Run> {
  const lines: string[] = [];
  const questions: string[] = [];
  const answers = [...(options.answers ?? [])];
  const code = await installHooks(
    {
      repoDir: options.repoDir ?? REPO,
      configDir,
      home,
      assumeYes: options.assumeYes ?? false,
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
  it('crée les réglages et le dossier s’ils n’existent pas, avec le chemin absolu du dépôt', async () => {
    const run = await install({ assumeYes: true });

    expect(run.code).toBe(0);
    expect(await readSettings()).toEqual({
      hooks: { SessionStart: [leonStart()], SessionEnd: [leonEnd()] },
    });
    expect(START).toBe(
      'pnpm -s --config.verify-deps-before-run=false --dir /Users/amos/leon leon briefing',
    );
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

  it('cite proprement un chemin avec espace et apostrophe, qu’un shell couperait', async () => {
    await install({ repoDir: "/Users/amos/Mes projets/l'équipe/leon", assumeYes: true });

    const { hooks } = await readSettings();
    expect(hooks.SessionStart[0].hooks[0].command).toBe(
      "pnpm -s --config.verify-deps-before-run=false --dir '/Users/amos/Mes projets/l'\\''équipe/leon' leon briefing",
    );
    expect(hooks.SessionEnd[0].hooks[0].command).toBe(
      "pnpm -s --config.verify-deps-before-run=false --dir '/Users/amos/Mes projets/l'\\''équipe/leon' leon capter-session",
    );
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

  it('garde la sauvegarde d’avant Leon quand le dépôt change de place (la mise à jour ne l’écrase pas)', async () => {
    const original = await writeSettings({ theme: 'dark' });
    await install({ repoDir: '/ancien/leon', assumeYes: true });
    expect(await readFile(settingsPath, 'utf8')).toContain('/ancien/leon');

    const run = await install({ repoDir: '/nouveau/leon', assumeYes: true });

    expect(run.code).toBe(0);
    expect(run.output).toContain('update');
    expect(await readFile(settingsPath, 'utf8')).toContain('/nouveau/leon');
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

  it('met à jour les crochets de Leon quand le dépôt a changé de place, sans en ajouter un second', async () => {
    const other = { type: 'command', command: 'echo bonjour' };
    await writeSettings({ hooks: { SessionStart: [{ hooks: [other] }] } });
    await install({ repoDir: '/old/leon', assumeYes: true });

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
  "  - At the end of each session, the Leon server receives the text of the exchanges (your messages and Claude's answers) and the actions of the session, read from its transcript: the files written (paths in the repository), the commands run (only their executable, plus the subcommand for a fixed list of developer tools such as git, gh, pnpm or docker; never their other arguments), Git (branch, commits, pull requests), the task list, and a few markers (start and end times, number of messages and tool errors, whether the session used the web, an MCP server, a subagent or a network command).",
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
    expect(await factsConsent(home, 'claude_code')).toBe(2);
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
    expect(run.output).toContain('Nothing was written');
    expect(await readFile(consentPath(home), 'utf8')).toBe(consentBefore);
    expect(await readFile(settingsPath, 'utf8')).toBe(before);
  });

  it('crochets en place, sans accord, avec --oui : écrit l’accord sans rien demander', async () => {
    await leonHooksInPlace();

    const run = await install({ assumeYes: true });

    expect(run.questions).toEqual([]);
    expect(run.output).toContain(CONSENT_TEXT);
    expect(await factsConsent(home, 'claude_code')).toBe(2);
  });

  it('ne rabaisse jamais un accord plus récent', async () => {
    await writeConsent(home, 'claude_code', 3);

    await install({ assumeYes: true });

    expect(await factsConsent(home, 'claude_code')).toBe(3);
  });

  it('un accord qui ne s’écrit pas : message clair et code 1, les crochets restent en place', async () => {
    // Un fichier à la place du dossier personnel : la création de ~/.leon échoue, même pour root.
    home = join(dir, 'home-fichier');
    await writeFile(home, '');

    const run = await install({ assumeYes: true });

    expect(run.code).toBe(1);
    expect(run.output).toContain(`could not write ${consentPath(home)}`);
    expect(run.output).toContain('only the text of the exchanges');
    expect((await readSettings()).hooks.SessionStart).toEqual([leonStart()]);
  });
});

describe('installHooks : les réglages du serveur dans le .env.local du dépôt', () => {
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

describe('addLeonHooks', () => {
  it('ne modifie pas l’objet reçu', () => {
    const settings = { hooks: { SessionStart: [{ hooks: [] }] } };
    const copy = structuredClone(settings);

    const result = addLeonHooks(settings, REPO);

    expect(settings).toEqual(copy);
    expect(result.changes.map((change) => change.action)).toEqual(['ajout', 'ajout']);
  });

  it('dit pour chaque évènement ce qu’il fait', () => {
    const first = addLeonHooks({}, REPO).settings;
    const again = addLeonHooks(first, REPO);
    const moved = addLeonHooks(first, '/ailleurs/leon');

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

  it('montre exactement ce que l’installateur écrit sur des réglages vides', async () => {
    await install({ repoDir: README_REPO, assumeYes: true });
    const written = await readSettings();

    expect(await readme()).toContain(JSON.stringify(written, null, 2));
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

  it('le commentaire de capture-session.ts ne dit pas non plus que `claude -p` échappe au crochet', async () => {
    const source = await readFile(`${REPO_ROOT}src/cli/capture-session.ts`, 'utf8');

    expect(source).not.toContain('ne sont jamais captés');
    expect(source).toContain('--bare');
  });
});
