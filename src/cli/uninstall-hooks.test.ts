import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consentPath, consentWithdrawn, factsConsent, writeConsent } from './consent';
import { installHooks, SETTINGS_FILE } from './install-hooks';
import { uninstallHooks } from './uninstall-hooks';

// Le retrait des crochets et de l'accord (T08), toujours sur des dossiers temporaires : jamais le vrai ~/.claude ni
// le vrai ~/.leon.

const REPO = '/Users/amos/leon';
const START = `pnpm -s --config.verify-deps-before-run=false --dir ${REPO} leon briefing`;
const END = `pnpm -s --config.verify-deps-before-run=false --dir ${REPO} leon capter-session`;
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const asRoot = process.getuid?.() === 0; // root passe outre les droits : l'essai en lecture seule n'a pas de sens

const leonStart = () => ({ hooks: [{ type: 'command', command: START, timeout: 10 }] });
const leonEnd = () => ({ hooks: [{ type: 'command', command: END, timeout: 30 }] });

let dir: string;
let home: string;
let configDir: string;
let settingsPath: string;
let locked: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'leon-uninstall-hooks-'));
  home = join(dir, 'home');
  configDir = join(dir, 'claude');
  settingsPath = join(configDir, SETTINGS_FILE);
  locked = [];
});

afterEach(async () => {
  for (const path of locked) await chmod(path, 0o700);
  await rm(dir, { recursive: true, force: true });
});

async function writeSettings(content: unknown): Promise<string> {
  const text = typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`;
  await mkdir(configDir, { recursive: true });
  await writeFile(settingsPath, text);
  return text;
}

const readSettings = async () => JSON.parse(await readFile(settingsPath, 'utf8'));

async function uninstall(): Promise<{ code: number; output: string }> {
  const lines: string[] = [];
  const code = await uninstallHooks(
    { configDir, home },
    { out: (text) => lines.push(text), err: (text) => lines.push(text) },
  );
  return { code, output: lines.join('\n') };
}

const removedText = () =>
  [
    `Leon hooks removed from ${settingsPath}:`,
    `  SessionStart · ${START}`,
    `  SessionEnd · ${END}`,
    'Your other settings and hooks are not touched (their values and order stay; the formatting of the file may change). Claude Code reloads this file by itself.',
    `Consent withdrawn in ${consentPath(home)}: Leon receives nothing more from Claude Code, not even from \`pnpm leon import-claude-code\`. To give it again, run \`pnpm leon installer-crochets\`.`,
    'The sessions already sent stay in Leon: there is no way to delete them yet.',
  ].join('\n');

const nothingLeftText = () =>
  [
    `No Leon hook in ${settingsPath}: nothing to remove.`,
    `Consent already withdrawn in ${consentPath(home)}.`,
    'The sessions already sent stay in Leon: there is no way to delete them yet.',
  ].join('\n');

describe('uninstallHooks : retirer les crochets de Leon', () => {
  it('rend les réglages d’avant l’installation, entrées de l’utilisateur intactes et dans leur ordre', async () => {
    const before = {
      theme: 'dark',
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: './garde.sh' }] }],
        SessionStart: [
          { matcher: 'startup', hooks: [{ type: 'command', command: 'echo bonjour' }] },
        ],
        Stop: [{ hooks: [{ type: 'command', command: 'say fini' }] }],
      },
    };
    await writeSettings(before);
    await installHooks(
      { repoDir: REPO, configDir, home, assumeYes: true },
      { out: () => {}, err: () => {}, ask: async () => '' },
    );

    const run = await uninstall();

    expect(run.code).toBe(0);
    const after = await readSettings();
    expect(after).toEqual(before);
    expect(Object.keys(after.hooks)).toEqual(['PreToolUse', 'SessionStart', 'Stop']);
  });

  it('garde un groupe qui porte aussi un crochet de l’utilisateur, et retire la clé « hooks » qu’il a vidée', async () => {
    const other = { type: 'command', command: 'echo bonjour' };
    await writeSettings({
      hooks: {
        SessionStart: [{ matcher: 'startup', hooks: [other, leonStart().hooks[0]] }],
        SessionEnd: [leonEnd()],
      },
    });

    await uninstall();

    expect((await readSettings()).hooks).toEqual({
      SessionStart: [{ matcher: 'startup', hooks: [other] }],
    });

    await writeSettings({
      theme: 'dark',
      hooks: { SessionStart: [leonStart()], SessionEnd: [leonEnd()] },
    });
    await uninstall();

    expect(await readSettings()).toEqual({ theme: 'dark' });
  });

  it('reconnaît les crochets comme l’installateur : les anciennes formes et les doublons partent, le reste est à l’utilisateur', async () => {
    const mine = [
      'echo pnpm leon briefing',
      'pnpm run build && echo leon briefing',
      'cd /x && pnpm leon briefing; rm -rf /tmp/rien',
      'pnpm -s --dir /x leon briefing && rm -rf /tmp/rien',
      'pnpm exec leon briefing',
      `pnpm -s --dir ${REPO} leon capter-session`,
    ].map((command) => ({ type: 'command', command }));
    await writeSettings({
      hooks: {
        SessionStart: [
          { hooks: mine },
          {
            hooks: [{ type: 'command', command: 'pnpm -s --dir /vieux/chemin/leon leon briefing' }],
          },
          { hooks: [{ type: 'command', command: 'pnpm --dir ~/leon leon briefing' }] },
        ],
        SessionEnd: [leonEnd(), leonEnd()],
      },
    });

    const run = await uninstall();

    expect(run.code).toBe(0);
    // Le crochet « capter-session » rangé sous SessionStart par l'utilisateur n'est pas touché.
    expect((await readSettings()).hooks).toEqual({ SessionStart: [{ hooks: mine }] });
  });

  it('dit mot pour mot ce qu’il a retiré, puis ce qu’il advient de l’accord', async () => {
    await writeSettings({ hooks: { SessionStart: [leonStart()], SessionEnd: [leonEnd()] } });
    await writeConsent(home, 'claude_code', 2);

    const run = await uninstall();

    expect(run.output).toBe(removedText());
  });

  it('est idempotent : un second passage ne change rien et le dit', async () => {
    await writeSettings({
      theme: 'dark',
      hooks: { SessionStart: [leonStart()], SessionEnd: [leonEnd()] },
    });
    await writeConsent(home, 'claude_code', 2);
    await uninstall();
    const settingsBefore = await readFile(settingsPath, 'utf8');
    const consentBefore = await readFile(consentPath(home), 'utf8');

    const run = await uninstall();

    expect(run.code).toBe(0);
    expect(run.output).toBe(nothingLeftText());
    expect(await readFile(settingsPath, 'utf8')).toBe(settingsBefore);
    expect(await readFile(consentPath(home), 'utf8')).toBe(consentBefore);
    expect(await readdir(configDir)).toEqual([SETTINGS_FILE]);
  });

  it('sans réglages : ne crée rien, et retire quand même l’accord', async () => {
    const run = await uninstall();

    expect(run.code).toBe(0);
    expect(run.output).toContain(`No Leon hook in ${settingsPath}: nothing to remove.`);
    expect(await readdir(dir)).toEqual(['home']);
    expect(await consentWithdrawn(home, 'claude_code')).toBe(true);
  });

  it('des réglages illisibles ne sont pas touchés : code 1, et l’accord est quand même retiré', async () => {
    const text = await writeSettings('{\n// mon thème\n"hooks": {}}');

    const run = await uninstall();

    expect(run.code).toBe(1);
    expect(run.output).toContain(
      `Leon: ${settingsPath} is unreadable (not a valid JSON object, or an inaccessible file): no hook was removed. Fix the file and run the command again, or delete the Leon entries by hand (see the README, section "Retirer les crochets").`,
    );
    expect(run.output).not.toContain('mon thème');
    expect(await readFile(settingsPath, 'utf8')).toBe(text);
    expect(await consentWithdrawn(home, 'claude_code')).toBe(true);
  });

  it('une forme que la doc ne connaît pas n’est pas touchée', async () => {
    const text = await writeSettings({ hooks: { SessionStart: 'à la main', SessionEnd: ['x'] } });

    const run = await uninstall();

    expect(run.code).toBe(0);
    expect(run.output).toContain('nothing to remove');
    expect(await readFile(settingsPath, 'utf8')).toBe(text);
  });

  it.skipIf(asRoot)(
    'une écriture impossible : message clair, code 1, réglages inchangés, accord retiré',
    async () => {
      const text = await writeSettings({ hooks: { SessionStart: [leonStart()] } });
      await chmod(configDir, 0o500);
      locked.push(configDir);

      const run = await uninstall();

      expect(run.code).toBe(1);
      expect(run.output).toContain(
        `Leon: could not write ${settingsPath} (permissions or disk space: EACCES). Nothing was modified: delete the Leon entries by hand (see the README, section "Retirer les crochets").`,
      );
      expect(await readFile(settingsPath, 'utf8')).toBe(text);
      expect(await consentWithdrawn(home, 'claude_code')).toBe(true);
    },
  );
});

describe('uninstallHooks : l’accord passe en version 0', () => {
  it.each([2, 3])('depuis la version %i : version 0, en 0600', async (version) => {
    await writeConsent(home, 'claude_code', version);

    await uninstall();

    const written = JSON.parse(await readFile(consentPath(home), 'utf8'));
    expect(written.outils.claude_code.version).toBe(0);
    expect((await stat(consentPath(home))).mode & 0o777).toBe(0o600);
    expect(await factsConsent(home, 'claude_code')).toBeNull();
  });

  it('sans accord (crochets d’avant lui) : version 0 aussi, pour que plus rien ne parte', async () => {
    await uninstall();

    expect(await consentWithdrawn(home, 'claude_code')).toBe(true);
  });

  it('garde les autres outils de l’accord', async () => {
    await mkdir(join(home, '.leon'), { recursive: true });
    await writeFile(
      consentPath(home),
      '{"outils":{"codex":{"version":2,"installe_le":"2026-11-01T10:00:00.000Z"}}}',
    );

    await uninstall();

    expect(JSON.parse(await readFile(consentPath(home), 'utf8')).outils.codex).toEqual({
      version: 2,
      installe_le: '2026-11-01T10:00:00.000Z',
    });
  });

  it('un accord qui ne s’écrit pas : message clair et code 1', async () => {
    home = join(dir, 'home-fichier'); // un fichier à la place du dossier personnel : ~/.leon ne se crée pas
    await writeFile(home, '');

    const run = await uninstall();

    expect(run.code).toBe(1);
    expect(run.output).toContain(
      `Leon: could not write ${consentPath(home)} (ENOTDIR): your consent is not withdrawn. Run the command again.`,
    );
  });
});

// La vraie commande, lancée comme le script `leon` (sans pnpm ni .env.local), sur un HOME et un CLAUDE_CONFIG_DIR
// temporaires. LEON_URL vise un port fermé : un envoi qui partirait malgré l'accord retiré échouerait sans rien
// atteindre, et le message attendu ne serait pas celui-là.
type Outcome = { code: number | null; stdout: string; stderr: string };

function leon(args: string[], input = ''): Promise<Outcome> {
  return new Promise((done, fail) => {
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? '',
      HOME: home,
      TMPDIR: tmpdir(),
      CLAUDE_CONFIG_DIR: configDir,
      LEON_URL: 'http://127.0.0.1:1',
      LEON_TOKEN: `leon_${'x'.repeat(43)}`,
    };
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli/leon.ts', ...args], {
      cwd: REPO_ROOT,
      env: env as NodeJS.ProcessEnv,
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

describe('leon retirer-crochets : la vraie commande', () => {
  const WITHDRAWN =
    'Leon: your consent for Claude Code was withdrawn (pnpm leon retirer-crochets): nothing is sent. To give it again, run pnpm leon installer-crochets.\n';

  it('retire les crochets et l’accord ; ensuite, ni le démarrage, ni la fin, ni l’import n’envoient rien', async () => {
    await writeSettings({ hooks: { SessionStart: [leonStart()], SessionEnd: [leonEnd()] } });
    await writeConsent(home, 'claude_code', 2);

    const removed = await leon(['retirer-crochets']);

    expect(removed.code).toBe(0);
    expect(removed.stdout).toBe(`${removedText()}\n`);
    expect(await readSettings()).toEqual({});

    const hookJson = JSON.stringify({
      session_id: 's1',
      transcript_path: join(configDir, 'projects', 'p', 's1.jsonl'),
      cwd: dir,
      hook_event_name: 'SessionStart',
    });
    const briefing = await leon(['briefing'], hookJson);
    const capture = await leon(['capter-session'], hookJson);
    const imported = await leon(['import-claude-code']);

    expect(briefing).toEqual({ code: 0, stdout: '', stderr: WITHDRAWN });
    expect(capture).toEqual({ code: 0, stdout: '', stderr: WITHDRAWN });
    expect(imported).toEqual({ code: 1, stdout: '', stderr: WITHDRAWN });
  }, 60_000);

  it('refuse une option qu’elle ne connaît pas, sans rien retirer', async () => {
    const text = await writeSettings({ hooks: { SessionStart: [leonStart()] } });

    const run = await leon(['retirer-crochets', '--outil', 'codex']);

    expect(run.code).toBe(1);
    expect(await readFile(settingsPath, 'utf8')).toBe(text);
    expect(await consentWithdrawn(home, 'claude_code')).toBe(false);
  }, 30_000);
});

describe('le README', () => {
  it('donne la commande de retrait et dit ce que vaut l’accord en version 0', async () => {
    const text = await readFile(`${REPO_ROOT}README.md`, 'utf8');

    expect(text).toContain('pnpm leon retirer-crochets');
    expect(text).toContain('version 0');
  });
});
