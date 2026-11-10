import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeConnection } from './connection';
import {
  addRefusal,
  addUsage,
  consentPath,
  consentWithdrawn,
  factsConsent,
  pendingServerWithdrawals,
  writeConsent,
} from './consent';
import { launcherHookCommand, launcherPath } from './hook-commands';
import { TokenRefusedError } from './import-claude-code';
import { installHooks, SETTINGS_FILE } from './install-hooks';
import { launcherScript, writeLauncher } from './launcher';
import {
  catchUpWithdrawals,
  connectionWithdrawal,
  type UninstallDeps,
  uninstallHooks,
  WITHDRAWAL_NOT_TOLD_LAST_MESSAGE,
  WITHDRAWAL_NOT_TOLD_MESSAGE,
  WITHDRAWAL_REFUSED_MESSAGE,
} from './uninstall-hooks';

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

// Le serveur de la connexion, simulé : il note les outils dont il apprend le retrait, avec sa date, et peut échouer.
type FakeServer = {
  told: string[];
  dates: string[];
  fails: boolean;
  refuses: boolean;
  withdraw: UninstallDeps['withdraw'];
};
function fakeServer(): FakeServer {
  const server: FakeServer = {
    told: [],
    dates: [],
    fails: false,
    refuses: false,
    withdraw: async (outil, retireLe) => {
      // Le retrait local est déjà écrit quand le serveur l'apprend.
      expect(await consentWithdrawn(home, outil)).toBe(true);
      if (server.fails) throw new Error('fetch failed');
      if (server.refuses) throw new TokenRefusedError();
      server.told.push(outil);
      server.dates.push(retireLe);
    },
  };
  return server;
}
let server: FakeServer;
beforeEach(() => {
  server = fakeServer();
});

async function uninstall(): Promise<{ code: number; output: string }> {
  const lines: string[] = [];
  const code = await uninstallHooks(
    { configDir, home },
    {
      out: (text) => lines.push(text),
      err: (text) => lines.push(text),
      withdraw: server.withdraw,
    },
  );
  return { code, output: lines.join('\n') };
}

// Pour redonner l'accord : `leon setup` sous la forme installée (le lanceur est effacé avec le dernier outil : la commande
// d'installation le remet), `pnpm leon installer-crochets` depuis un clone.
const AGAIN =
  'To give it again, run `~/.leon/bin/leon setup` (if that file is gone, run the install command of Leon again: `curl -fsSL <address of Leon>/install | sh`; from a Leon clone: `pnpm leon installer-crochets`).';

const removedText = () =>
  [
    `Leon hooks removed from ${settingsPath}:`,
    `  SessionStart · ${START}`,
    `  SessionEnd · ${END}`,
    'Your other settings and hooks are not touched (their values and order stay; the formatting of the file may change). Claude Code reloads this file by itself.',
    `Consent withdrawn in ${consentPath(home)}: Leon receives nothing more from Claude Code, not even from \`leon import-claude-code\`. ${AGAIN}`,
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
    expect(server.told).toEqual(['claude_code']); // le serveur l'a appris au premier passage
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

describe('uninstallHooks : les crochets de la forme du lanceur (K9)', () => {
  it('retire les deux crochets, et rend les réglages de l’utilisateur intacts, dans leur ordre', async () => {
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
    const home = "/Users/Léa O'Neil";
    const start = launcherHookCommand(home, 'briefing');
    const end = launcherHookCommand(home, 'capter-session');
    await writeSettings({
      ...before,
      hooks: {
        ...before.hooks,
        SessionStart: [
          ...before.hooks.SessionStart,
          { hooks: [{ type: 'command', command: start, timeout: 10 }] },
        ],
        SessionEnd: [{ hooks: [{ type: 'command', command: end, timeout: 30 }] }],
      },
    });

    const run = await uninstall();

    expect(run.code).toBe(0);
    expect(run.output).toContain(`  SessionStart · ${start}`);
    expect(run.output).toContain(`  SessionEnd · ${end}`);
    const after = await readSettings();
    expect(after).toEqual(before);
    expect(Object.keys(after.hooks)).toEqual(['PreToolUse', 'SessionStart', 'Stop']);
  });

  it('une commande de l’utilisateur qui cite le lanceur n’est pas retirée', async () => {
    const mine = [
      `echo ${launcherHookCommand('/Users/amos', 'briefing')}`,
      `${launcherHookCommand('/Users/amos', 'briefing')} && rm -rf /tmp/rien`,
    ].map((command) => ({ type: 'command', command }));
    await writeSettings({ hooks: { SessionStart: [{ hooks: mine }] } });

    const run = await uninstall();

    expect(run.output).toContain('nothing to remove');
    expect((await readSettings()).hooks).toEqual({ SessionStart: [{ hooks: mine }] });
  });
});

describe('uninstallHooks : le lanceur part avec le dernier outil', () => {
  const CLONE = { kind: 'clone', repoDir: '/Users/amos/leon' } as const;
  const withCodex = async () => {
    await mkdir(join(home, '.leon'), { recursive: true });
    await writeFile(
      consentPath(home),
      '{"outils":{"codex":{"version":2,"installe_le":"2026-11-01T10:00:00.000Z"}}}',
    );
  };

  it('plus aucun outil dans accord.json : le lanceur est effacé, et le dit', async () => {
    await writeSettings({ hooks: { SessionStart: [leonStart()], SessionEnd: [leonEnd()] } });
    await writeConsent(home, 'claude_code', 2);
    await writeLauncher(home, CLONE);

    const run = await uninstall();

    expect(run.code).toBe(0);
    expect(run.output).toBe(
      removedText().replace(
        'The sessions already sent',
        `Launcher removed: ${launcherPath(home)} (no other tool uses it).\nThe sessions already sent`,
      ),
    );
    // Le lanceur et son dossier sont partis ; restent l'accord et ce que le serveur a appris.
    expect((await readdir(join(home, '.leon'))).sort()).toEqual([
      'accord.json',
      'retraits-serveur.json',
    ]);
  });

  it('sans réglages à retirer non plus : l’accord est retiré, donc le lanceur ne sert plus', async () => {
    await writeLauncher(home, CLONE);

    const run = await uninstall();

    expect(run.code).toBe(0);
    // Le lanceur et son dossier sont partis ; restent l'accord et ce que le serveur a appris.
    expect((await readdir(join(home, '.leon'))).sort()).toEqual([
      'accord.json',
      'retraits-serveur.json',
    ]);
  });

  it('un autre outil garde son accord : le lanceur reste, sans un mot de plus', async () => {
    await withCodex();
    await writeLauncher(home, CLONE);

    const run = await uninstall();

    expect(run.code).toBe(0);
    expect(run.output).not.toContain('auncher');
    expect(await readFile(launcherPath(home), 'utf8')).toBe(launcherScript(home, CLONE));
  });

  it('l’autre outil est lui aussi retiré (version 0) : le lanceur part', async () => {
    await mkdir(join(home, '.leon'), { recursive: true });
    await writeFile(
      consentPath(home),
      '{"outils":{"codex":{"version":0,"installe_le":"2026-11-01T10:00:00.000Z"}}}',
    );
    await writeLauncher(home, CLONE);

    await uninstall();

    // Le lanceur et son dossier sont partis ; restent l'accord et ce que le serveur a appris.
    expect((await readdir(join(home, '.leon'))).sort()).toEqual([
      'accord.json',
      'retraits-serveur.json',
    ]);
  });

  it('une entrée d’un autre outil que le schéma ne connaît pas compte comme installée : le lanceur reste', async () => {
    await mkdir(join(home, '.leon'), { recursive: true });
    await writeFile(consentPath(home), '{"outils":{"codex":{"version":"2"}}}');
    await writeLauncher(home, CLONE);

    await uninstall();

    expect(await readFile(launcherPath(home), 'utf8')).toBe(launcherScript(home, CLONE));
  });

  it('des réglages illisibles gardent le lanceur : leurs crochets en ont encore besoin', async () => {
    await writeSettings('{\n// mon thème\n"hooks": {}}');
    await writeLauncher(home, CLONE);

    const run = await uninstall();

    expect(run.code).toBe(1);
    expect(await readFile(launcherPath(home), 'utf8')).toBe(launcherScript(home, CLONE));
  });

  it.skipIf(asRoot)('un accord qui ne s’écrit pas garde le lanceur', async () => {
    await writeLauncher(home, CLONE);
    await chmod(join(home, '.leon'), 0o500);
    locked.push(join(home, '.leon'));

    const run = await uninstall();

    expect(run.code).toBe(1);
    expect(await readFile(launcherPath(home), 'utf8')).toBe(launcherScript(home, CLONE));
  });

  it('un fichier qui n’est pas un lanceur de Leon est gardé, et le dit', async () => {
    await mkdir(join(home, '.leon', 'bin'), { recursive: true });
    await writeFile(launcherPath(home), '#!/bin/sh\necho à moi\n');

    const run = await uninstall();

    expect(run.code).toBe(0);
    expect(run.output).toContain(
      `${launcherPath(home)} was left in place: it is not a launcher written by Leon.`,
    );
    expect(await readFile(launcherPath(home), 'utf8')).toBe('#!/bin/sh\necho à moi\n');
  });

  it('est idempotent : un second passage ne dit rien du lanceur', async () => {
    await writeLauncher(home, CLONE);
    await uninstall();

    const run = await uninstall();

    expect(run.code).toBe(0);
    expect(run.output).toBe(nothingLeftText());
  });
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

  // C7 révisé, A16 : le retrait efface les usages et les refus ; un `leon setup` suivant les propose de nouveau.
  it('efface les usages et les refus', async () => {
    await writeConsent(home, 'claude_code', 2);
    await addUsage(home, 'claude_code', 'lecture');
    await addRefusal(home, 'claude_code', 'resume');

    await uninstall();

    expect(JSON.parse(await readFile(consentPath(home), 'utf8')).outils.claude_code).toEqual({
      version: 0,
      installe_le: expect.any(String),
    });
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

  it('un accord.json coupé est réécrit en version 0', async () => {
    await mkdir(join(home, '.leon'), { recursive: true });
    await writeFile(consentPath(home), '{"outils": {"claude_code": {"vers');

    const run = await uninstall();

    expect(run.code).toBe(0);
    expect(run.output).toContain(`Consent withdrawn in ${consentPath(home)}`);
    expect(JSON.parse(await readFile(consentPath(home), 'utf8')).outils.claude_code.version).toBe(
      0,
    );
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

// Le retrait atteint le serveur de la connexion du moment (T43) : il y vide les usages des sessions déjà envoyées.
describe('uninstallHooks : le serveur apprend le retrait', () => {
  it('l’apprend une fois le retrait local écrit, et la date de sa réponse évite de le lui redire', async () => {
    await writeConsent(home, 'claude_code', 2);

    const run = await uninstall();

    expect(run.code).toBe(0);
    expect(server.told).toEqual(['claude_code']);
    expect(await pendingServerWithdrawals(home)).toEqual([]);
  });

  // Le dernier outil : plus aucun crochet ne lancera le rattrapage. La ligne dit de relancer la commande, et le lanceur,
  // qui la lance, reste jusque-là.
  it('dernier outil, injoignable, ancien ou sans connexion : une ligne vraie, le lanceur gardé, le retrait local fait, même code de sortie', async () => {
    await writeSettings({ hooks: { SessionStart: [leonStart()], SessionEnd: [leonEnd()] } });
    await writeConsent(home, 'claude_code', 2);
    await writeLauncher(home, { kind: 'clone', repoDir: REPO });
    server.fails = true;

    const run = await uninstall();

    expect(run.code).toBe(0);
    expect(run.output).toBe(
      removedText().replace(
        'The sessions already sent',
        `${WITHDRAWAL_NOT_TOLD_LAST_MESSAGE}\nLauncher kept: ${launcherPath(home)} (until the Leon server is told of the withdrawal).\nThe sessions already sent`,
      ),
    );
    expect(WITHDRAWAL_NOT_TOLD_LAST_MESSAGE).toBe(
      'Leon: the Leon server could not be told of this withdrawal (no connection, server unreachable, or older than this CLI). Your consent is withdrawn on this computer all the same; no tool keeps Leon hooks to tell the server later, so run this command again once online. If this computer is not connected, run `leon login` first.',
    );
    expect(await readFile(launcherPath(home), 'utf8')).toBe(
      launcherScript(home, { kind: 'clone', repoDir: REPO }),
    );
    expect(await consentWithdrawn(home, 'claude_code')).toBe(true);
    expect(await pendingServerWithdrawals(home)).toEqual(['claude_code']);

    // Relancée une fois en ligne : le serveur l'apprend, et le lanceur part.
    server.fails = false;
    const again = await uninstall();

    expect(server.told).toEqual(['claude_code']);
    expect(again.output).toContain(
      `Launcher removed: ${launcherPath(home)} (no other tool uses it).`,
    );
    expect(await pendingServerWithdrawals(home)).toEqual([]);
  });

  it('un autre outil garde ses crochets : la ligne renvoie au démarrage de ses sessions', async () => {
    await writeConsent(home, 'codex', 2);
    await writeConsent(home, 'claude_code', 2);
    server.fails = true;

    const run = await uninstall();

    expect(run.output).toContain(WITHDRAWAL_NOT_TOLD_MESSAGE);
    expect(WITHDRAWAL_NOT_TOLD_MESSAGE).toBe(
      'Leon: the Leon server could not be told of this withdrawal (no connection, server unreachable, or older than this CLI). Your consent is withdrawn on this computer all the same; Leon tells the server at the next session start of a tool that still has its hooks, or when you run this command again. If this computer is not connected, run `leon login` first.',
    );
  });

  // Un ordinateur révoqué dans Réglages : relancer la commande ne suffit pas, il faut d'abord un jeton qui vaut.
  it('jeton refusé : une ligne qui dit de se reconnecter, sans jeton ni adresse', async () => {
    await writeConsent(home, 'claude_code', 2);
    server.refuses = true;

    const run = await uninstall();

    expect(run.code).toBe(0);
    expect(run.output).toContain(WITHDRAWAL_REFUSED_MESSAGE);
    expect(run.output).not.toContain(WITHDRAWAL_NOT_TOLD_LAST_MESSAGE);
    expect(WITHDRAWAL_REFUSED_MESSAGE).toBe(
      'Leon: the Leon server refused the token of this computer, so it could not be told of this withdrawal. Your consent is withdrawn on this computer all the same; run `leon login`, then this command again.',
    );
    expect(await pendingServerWithdrawals(home)).toEqual(['claude_code']);
  });

  it('dit aussi au serveur un autre retrait resté en attente, pour que le lanceur puisse partir', async () => {
    await writeConsent(home, 'codex', 0);
    await writeConsent(home, 'claude_code', 2);
    await writeLauncher(home, { kind: 'clone', repoDir: REPO });

    const run = await uninstall();

    expect(server.told).toEqual(['claude_code', 'codex']);
    expect(run.output).toContain(
      `Launcher removed: ${launcherPath(home)} (no other tool uses it).`,
    );
  });

  it('un retrait d’avant, que le serveur n’a pas appris : relancer la commande le lui dit', async () => {
    await writeConsent(home, 'claude_code', 0);

    const run = await uninstall();

    expect(run.output).toContain(`Consent already withdrawn in ${consentPath(home)}.`);
    expect(server.told).toEqual(['claude_code']);
  });

  it('un accord qui ne s’écrit pas : rien ne part au serveur', async () => {
    home = join(dir, 'home-fichier');
    await writeFile(home, '');

    await uninstall();

    expect(server.told).toEqual([]);
  });
});

// Le rattrapage (`leon rattraper`, lancé détaché au démarrage d'une session) : les retraits faits avant que la commande
// n'appelle le serveur, ou hors ligne.
describe('catchUpWithdrawals : le serveur apprend les retraits restés sur le poste', () => {
  it('une fois chaque outil retiré, puis plus ; un outil en cours n’est pas cité', async () => {
    await writeConsent(home, 'claude_code', 0);
    await writeConsent(home, 'codex', 0);
    await writeConsent(home, 'cursor', 2);

    await catchUpWithdrawals(home, server.withdraw);
    await catchUpWithdrawals(home, server.withdraw);

    expect(server.told).toEqual(['claude_code', 'codex']);
  });

  it('un échec garde l’outil en attente pour le rattrapage suivant ; un nouveau retrait l’est de nouveau', async () => {
    await writeConsent(home, 'antigravity', 0, new Date('2026-11-10T09:00:00Z'));
    server.fails = true;
    expect(await catchUpWithdrawals(home, server.withdraw)).toBe('failed');
    server.fails = false;
    expect(await catchUpWithdrawals(home, server.withdraw)).toBe('told');
    expect(server.told).toEqual(['antigravity']);

    await writeConsent(home, 'antigravity', 2, new Date('2026-11-10T10:00:00Z'));
    await writeConsent(home, 'antigravity', 0, new Date('2026-11-10T11:00:00Z'));
    await catchUpWithdrawals(home, server.withdraw);

    expect(server.told).toEqual(['antigravity', 'antigravity']);
  });

  // T43, le retrait daté : le serveur ignore ensuite les usages des faits envoyés sous un accord qui ne suit pas cette
  // date, mesurée par la même horloge que celle de l'accord (writeConsent).
  it('dit au serveur la date de l’entrée en version 0, relue au moment d’envoyer', async () => {
    await writeConsent(home, 'codex', 0, new Date('2026-11-10T09:00:00Z'));

    await catchUpWithdrawals(home, server.withdraw);

    expect(server.told).toEqual(['codex']);
    expect(server.dates).toEqual(['2026-11-10T09:00:00.000Z']);
  });

  it('une date retouchée à la main, absente ou illisible, vaut l’heure du moment', async () => {
    await mkdir(join(home, '.leon'), { recursive: true });
    await writeFile(
      consentPath(home),
      JSON.stringify({
        outils: { codex: { version: 0 }, cursor: { version: 0, installe_le: 'hier' } },
      }),
    );
    const before = Date.now();

    await catchUpWithdrawals(home, server.withdraw);

    expect(server.told).toEqual(['codex', 'cursor']);
    for (const date of server.dates) {
      expect(Date.parse(date)).toBeGreaterThanOrEqual(before);
      expect(Date.parse(date)).toBeLessThanOrEqual(Date.now());
    }
  });

  it('un outil qui n’est plus en version 0 au moment d’envoyer ne part pas', async () => {
    await writeConsent(home, 'claude_code', 0);
    await writeConsent(home, 'codex', 0);
    const withdraw = server.withdraw;
    // Un nouvel accord de Codex, écrit pendant l'envoi du retrait de Claude Code.
    server.withdraw = async (outil, retireLe) => {
      await withdraw(outil, retireLe);
      await writeConsent(home, 'codex', 2);
    };

    expect(await catchUpWithdrawals(home, server.withdraw)).toBe('told');

    expect(server.told).toEqual(['claude_code']);
  });
});

// Les crochets lancés hors du terminal (Dock) lisent connexion.json ; la commande lit d'abord LEON_URL et LEON_TOKEN.
describe('connectionWithdrawal : le retrait se dit à chaque connexion que les crochets peuvent prendre', () => {
  const SAVED = `leon_${'a'.repeat(43)}`;
  const TERMINAL = `leon_${'b'.repeat(43)}`;
  const RETIRE_LE = '2026-11-10T09:00:00.000Z';
  type Request = { url: string; authorization: string | null; body: unknown };

  async function withdrawWith(env: Record<string, string>): Promise<Request[]> {
    await writeConnection(home, {
      url: 'http://127.0.0.1:4000',
      jeton: SAVED,
      ordinateur: 'portable',
      espace: 'acme',
      cree_le: '2026-11-01T10:00:00.000Z',
    });
    const requests: Request[] = [];
    const fetchImpl = (async (url: URL | RequestInfo, init?: RequestInit) => {
      requests.push({
        url: String(url),
        authorization: new Headers(init?.headers).get('Authorization'),
        body: JSON.parse(String(init?.body)),
      });
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    await connectionWithdrawal(fetchImpl, env, home)('claude_code', RETIRE_LE);
    return requests;
  }

  it('deux jetons : aux deux, à la même date', async () => {
    const requests = await withdrawWith({
      LEON_URL: 'http://127.0.0.1:5000',
      LEON_TOKEN: TERMINAL,
    });

    const body = { outil: 'claude_code', retire_le: RETIRE_LE };
    expect(requests).toEqual([
      { url: 'http://127.0.0.1:5000/api/v1/retrait', authorization: `Bearer ${TERMINAL}`, body },
      { url: 'http://127.0.0.1:4000/api/v1/retrait', authorization: `Bearer ${SAVED}`, body },
    ]);
  });

  it('un seul jeton : une fois', async () => {
    const requests = await withdrawWith({ LEON_URL: 'http://127.0.0.1:4000', LEON_TOKEN: SAVED });

    expect(requests.map((request) => request.authorization)).toEqual([`Bearer ${SAVED}`]);
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
  const WITHDRAWN = `Leon: your consent for Claude Code was withdrawn (\`leon retirer-crochets\`): nothing is sent. ${AGAIN}\n`;

  it('retire les crochets et l’accord ; ensuite, ni le démarrage, ni la fin, ni l’import n’envoient rien', async () => {
    await writeSettings({ hooks: { SessionStart: [leonStart()], SessionEnd: [leonEnd()] } });
    await writeConsent(home, 'claude_code', 2);

    const removed = await leon(['retirer-crochets']);

    expect(removed.code).toBe(0);
    expect(removed.stdout).toBe(`${removedText()}\n`);
    // Le serveur de LEON_URL ne répond pas (port fermé) : une ligne, et le retrait local est fait.
    expect(removed.stderr).toBe(`${WITHDRAWAL_NOT_TOLD_LAST_MESSAGE}\n`);
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

  it('accepte --outil claude_code, le seul outil du lot 1', async () => {
    await writeSettings({ hooks: { SessionStart: [leonStart()], SessionEnd: [leonEnd()] } });

    const run = await leon(['retirer-crochets', '--outil', 'claude_code']);

    expect(run.code).toBe(0);
    expect(run.stdout).toBe(`${removedText()}\n`);
    expect(await consentWithdrawn(home, 'claude_code')).toBe(true);
  }, 30_000);

  it.each([[['--outil', 'windsurf']], [['--outil']], [['--autre']]])(
    'refuse %j sans rien retirer, par un message fixe',
    async (options) => {
      const text = await writeSettings({ hooks: { SessionStart: [leonStart()] } });

      const run = await leon(['retirer-crochets', ...options]);

      expect(run.code).toBe(1);
      expect(run.stdout).toBe('');
      expect(await readFile(settingsPath, 'utf8')).toBe(text);
      expect(await consentWithdrawn(home, 'claude_code')).toBe(false);
    },
    30_000,
  );

  it('ne recopie pas l’outil inconnu dans son message', async () => {
    const run = await leon(['retirer-crochets', '--outil', 'MOT-INCONNU']);

    expect(run).toEqual({
      code: 1,
      stdout: '',
      stderr: '--outil: unknown tool (one of: claude_code, codex, cursor, antigravity).\n',
    });
  }, 30_000);
});

describe('le README', () => {
  it('donne la commande de retrait et dit ce que vaut l’accord en version 0', async () => {
    const text = await readFile(`${REPO_ROOT}README.md`, 'utf8');

    expect(text).toContain('pnpm leon retirer-crochets');
    expect(text).toContain('version 0');
  });

  it('dit que le lanceur est effacé avec le dernier outil, et comment tout retirer', async () => {
    const text = await readFile(`${REPO_ROOT}README.md`, 'utf8');
    const section = text.slice(text.indexOf('### Retirer les crochets'));

    expect(section).toContain('~/.leon/bin/leon retirer-crochets');
    expect(section).toMatch(/lanceur[^\n]*effacé avec le dernier outil/);
    expect(section).toMatch(/gardé tant que le serveur n'a pas appris/);
    // `leon logout` d'abord effacerait la connexion par laquelle le retrait prévient le serveur.
    expect(section).toMatch(
      /partir complètement : `leon retirer-crochets` d'abord[^\n]*révoquez cet ordinateur dans Réglages/,
    );
    expect(section).not.toContain("`leon logout` d'abord");
  });

  it('l’aide de la commande dit la même chose : le lanceur part avec le dernier outil', async () => {
    const source = await readFile(`${REPO_ROOT}src/cli/leon.ts`, 'utf8');
    const help = source.slice(source.indexOf('retirer-crochets     Remove'));

    expect(help).toContain('~/.leon/bin/leon goes too, once no tool is left that uses it');
    expect(help).toContain('and the server was told');
  });
});
