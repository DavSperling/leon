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

let dir: string;
let configDir: string;
let settingsPath: string;
let backupPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'leon-install-hooks-'));
  configDir = join(dir, 'claude');
  settingsPath = join(configDir, SETTINGS_FILE);
  backupPath = join(configDir, BACKUP_FILE);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

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
    { repoDir: options.repoDir ?? REPO, configDir, assumeYes: options.assumeYes ?? false },
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
    expect(run.output).toContain('déjà');
    expect(await readFile(settingsPath, 'utf8')).toBe(afterFirst);
    // La sauvegarde garde l'état d'avant la première installation, pas celui d'avant la seconde.
    expect(await readFile(backupPath, 'utf8')).toBe(original);
    const { hooks } = await readSettings();
    expect(hooks.SessionStart).toHaveLength(1);
    expect(hooks.SessionEnd).toHaveLength(1);
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
    expect(run.output).toContain('mise à jour');
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

  it('entrée « non » : rien n’est écrit, ni réglages ni sauvegarde', async () => {
    const original = await writeSettings({ theme: 'dark' });

    const run = await install({ answers: ['non'] });

    expect(run.code).toBe(0);
    expect(run.questions).toHaveLength(1);
    expect(run.output).toContain("Rien n'a été écrit");
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
    expect(run.output).toContain('a changé');
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
    expect(run.output).toContain('illisible');
    expect(run.output).toContain("Rien n'a été écrit");
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
    expect(run.output).toContain('illisible');
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
    expect(run.output).toContain('forme attendue');
    expect(run.output).toContain("Rien n'a été écrit");
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

  it('prévient quand le dépôt est un dossier de travail temporaire (worktree)', async () => {
    const run = await install({
      repoDir: '/Users/amos/leon/.claude/worktrees/une-tache',
      assumeYes: true,
    });

    expect(run.code).toBe(0);
    expect(run.output).toContain('dossier de travail temporaire');
    expect(run.output).toContain('--depot');
  });

  it('ne prévient pas pour le clone principal', async () => {
    const run = await install({ assumeYes: true });

    expect(run.output).not.toContain('temporaire');
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
});
