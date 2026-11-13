import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consentWithdrawn, factsConsent, pendingServerWithdrawals, writeConsent } from './consent';
import { CATCH_UP_WHEN, launcherCommand } from './hook-commands';
import {
  CURSOR_CONSENT_LINES,
  cursorHooksPath,
  installCursorHooks,
  uninstallCursorHooks,
} from './install-cursor';
import {
  COULISSES_LINES,
  LECTURE_LINES,
  NOTER_LINES,
  RAPPEL_LINES,
  RESUME_LINES,
  type UsageOptions,
} from './install-hooks';
import { protectedCloneWarning } from './install-outil';
import { writeLauncher } from './launcher';
import { type UninstallDeps, WITHDRAWAL_NOT_TOLD_LAST_MESSAGE } from './uninstall-hooks';

// L'installateur et le retrait des crochets de Cursor (T29), toujours dans un HOME temporaire : jamais le vrai ~/.cursor.

let dir: string;
let home: string;
let hooksPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'leon-install-cursor-'));
  home = join(dir, 'home');
  hooksPath = cursorHooksPath(home);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const prompt = () => ({ command: launcherCommand(home, 'cursor', 'prompt'), timeout: 5 });
const tour = () => ({ command: launcherCommand(home, 'cursor', 'tour'), timeout: 30 });
const userEntry = { command: './hooks/audit.sh' };

async function writeHooks(content: unknown): Promise<string> {
  const text = typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`;
  await mkdir(join(home, '.cursor'), { recursive: true });
  await writeFile(hooksPath, text);
  return text;
}
const readHooks = async () => JSON.parse(await readFile(hooksPath, 'utf8'));

// `usages` : le terminal (`interactive`) et les usages déjà tranchés dans le passage (T47).
async function install(
  answers: (string | null)[] = ['oui'],
  assumeYes = false,
  usages: UsageOptions = {},
) {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const code = await installCursorHooks(
    { home, assumeYes, ...usages },
    {
      out: (text) => out.push(text),
      err: (text) => err.push(text),
      ask: async (question) => {
        asked.push(question);
        return answers.shift() ?? null;
      },
    },
  );
  return { code, out: out.join('\n'), err: err.join('\n'), asked };
}

// Le serveur de la connexion, simulé (T43) : il apprend le retrait, ou échoue.
async function uninstall(withdraw: UninstallDeps['withdraw'] = async () => {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await uninstallCursorHooks(
    { home },
    { out: (text) => out.push(text), err: (text) => err.push(text), withdraw },
  );
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('installCursorHooks', () => {
  it('crée le fichier absent, forme plate version 1, et écrit l’accord de capture', async () => {
    const { code, out } = await install();

    expect(code).toBe(0);
    expect(await readHooks()).toEqual({
      version: 1,
      hooks: { beforeSubmitPrompt: [prompt()], stop: [tour()] },
    });
    expect(out).toContain('  beforeSubmitPrompt · timeout 5 s · add');
    expect(out).toContain('  stop · timeout 30 s · add');
    const consent = await factsConsent(home, 'cursor');
    expect(consent?.version).toBe(2);
    expect(consent?.capture_le).toBeInstanceOf(Date);
  });

  it('ajoute en fin de liste, garde les entrées de l’utilisateur et les autres clés', async () => {
    await writeHooks({ version: 1, hooks: { stop: [userEntry], afterFileEdit: [userEntry] } });

    expect((await install()).code).toBe(0);

    expect(await readHooks()).toEqual({
      version: 1,
      hooks: {
        stop: [userEntry, tour()],
        afterFileEdit: [userEntry],
        beforeSubmitPrompt: [prompt()],
      },
    });
  });

  it('montre le texte exact de l’accord ; un refus n’écrit rien', async () => {
    const { out, asked } = await install(['non']);

    for (const line of CURSOR_CONSENT_LINES) expect(out).toContain(line);
    const text = CURSOR_CONSENT_LINES.join('\n');
    expect(text).toContain('labeled as written by Cursor, not by you');
    expect(text).toContain("so it is given to Cursor's model");
    expect(text).toContain('state.vscdb) are never read');
    expect(text).toContain(CATCH_UP_WHEN);
    expect(text).toContain('once per conversation');
    // Décision 4 d'Amos pour le lot 14 : qui lit vraiment la conversation (0057).
    expect(text).toContain(
      'Each conversation is read by you and, on the Leon website, by the managers above you, never by your other colleagues.',
    );
    expect(text).not.toContain('private');
    expect(asked).toHaveLength(1);
    await expect(readFile(hooksPath)).rejects.toThrow();
    expect(await factsConsent(home, 'cursor')).toBeNull();
  });

  it('est idempotente, et met à jour sur place une entrée de Leon d’une autre forme', async () => {
    await writeHooks({
      version: 1,
      hooks: { stop: [{ command: launcherCommand(home, 'cursor', 'tour') }, userEntry, tour()] },
    });

    expect((await install()).code).toBe(0);
    expect((await readHooks()).hooks.stop).toEqual([tour(), userEntry]);

    const before = await readFile(hooksPath, 'utf8');
    const again = await install([]);
    expect(again.asked).toEqual([]);
    expect(again.out).toContain('already in place');
    expect(await readFile(hooksPath, 'utf8')).toBe(before);
  });

  it('ne réécrit jamais un fichier illisible ou d’une autre version', async () => {
    for (const content of ['{ "version": 1, // commentaire\n }', { version: 2, hooks: {} }]) {
      const text = await writeHooks(content);
      const { code, err } = await install();
      expect(code).toBe(1);
      expect(err).toContain('Nothing was written');
      expect(await readFile(hooksPath, 'utf8')).toBe(text);
    }
  });
});

// T47 (décisions d'Amos du 11/11) : Cursor propose `lecture` puis `resume`, avec les textes de Claude Code, dans un
// terminal, après l'accord de base et la capture (install-outil.ts, partagé avec Antigravity).
describe('installCursorHooks : les usages', () => {
  const terminal = { interactive: true };

  it('dans un terminal, après l’accord : lecture, rappel, noter puis resume, avec les mêmes textes, écrits pour Cursor seul', async () => {
    const { code, out, asked } = await install(
      ['oui', 'non', 'plus tard', 'plus tard', 'oui'],
      false,
      terminal,
    );

    expect(code).toBe(0);
    expect(asked).toHaveLength(5);
    expect(out.indexOf(NOTER_LINES.join('\n'))).toBeGreaterThan(
      out.indexOf(RAPPEL_LINES.join('\n')),
    );
    expect(out.indexOf(RESUME_LINES.join('\n'))).toBeGreaterThan(
      out.indexOf(NOTER_LINES.join('\n')),
    );
    expect(out.indexOf(LECTURE_LINES.join('\n'))).toBeGreaterThan(out.indexOf('Consent recorded'));
    expect(out.indexOf(RESUME_LINES.join('\n'))).toBeGreaterThan(
      out.indexOf(LECTURE_LINES.join('\n')),
    );
    expect(out).toContain('`~/.leon/bin/leon retirer-crochets --outil cursor`');
    expect(await factsConsent(home, 'cursor')).toMatchObject({
      usages: ['resume'],
      refus: ['lecture'],
    });
    expect(await factsConsent(home, 'claude_code')).toBeNull();
  });

  it('crochets et capture en place, sans usage : plus de « nothing to do », le fichier n’est pas touché', async () => {
    await install();
    const before = await readFile(hooksPath, 'utf8');

    const { out, asked } = await install(['', null, null, null], false, terminal);

    expect(asked).toHaveLength(4);
    expect(out).toContain(`The Leon hooks are already in place in ${hooksPath}.`);
    expect(out).not.toContain('nothing to do');
    expect((await factsConsent(home, 'cursor'))?.usages).toEqual(['lecture']);
    expect(await readFile(hooksPath, 'utf8')).toBe(before);
  });

  it.each([
    ['la capture refusée', ['non', 'oui', 'oui'], false, terminal],
    ['hors terminal, même avec « y »', ['oui', '', 'y'], false, {}],
    ['avec --oui, même dans un terminal', [], true, terminal],
  ])('%s : ni question ni usage', async (_name, answers, assumeYes, usages) => {
    const { out, asked } = await install(answers, assumeYes, usages);

    expect(asked.length).toBeLessThanOrEqual(1);
    expect(out).not.toContain(LECTURE_LINES[0]);
    expect((await factsConsent(home, 'cursor'))?.usages ?? []).toEqual([]);
    expect((await factsConsent(home, 'cursor'))?.refus ?? []).toEqual([]);
  });

  // Lot 14, décision 2 d'Amos : `coulisses` est pour Claude Code seul, tant que la CLI ne relève pas celles de Cursor.
  it('coulisses n’est ni demandé ni écrit pour Cursor, même tranché oui dans le passage par Claude Code', async () => {
    const { out, asked } = await install(['oui', null, null, null, null], false, {
      ...terminal,
      decisions: new Map([['coulisses', true]]),
    });

    expect(asked).toHaveLength(5);
    expect(out).not.toContain(COULISSES_LINES[0]);
    expect(await factsConsent(home, 'cursor')).toMatchObject({ usages: [], refus: [] });
  });

  it('le retrait efface usages, refus et capture ; une réinstallation dans un terminal les repropose', async () => {
    await install(['oui', 'oui', 'non'], false, terminal);

    await uninstall();

    expect(
      JSON.parse(await readFile(join(home, '.leon', 'accord.json'), 'utf8')).outils.cursor,
    ).toEqual({ version: 0, installe_le: expect.any(String) });
    expect((await install(['oui', null, null, null, null], false, terminal)).asked).toHaveLength(5);
  });

  // T49 : beforeSubmitPrompt est déjà posé, le rappel n'ajoute aucun crochet (briefing.ts le demande avec l'usage).
  it('rappel : proposé avec son texte, en [Y/n], accepté par Entrée, et aucun crochet de plus', async () => {
    await install();
    const before = await readFile(hooksPath, 'utf8');

    const { out, asked } = await install(['non', '', 'non'], false, terminal);

    expect(asked[1]).toContain('[Y/n]');
    expect(out).toContain(RAPPEL_LINES.join('\n'));
    expect(await factsConsent(home, 'cursor')).toMatchObject({ usages: ['rappel'] });
    expect(await readFile(hooksPath, 'utf8')).toBe(before);
  });
});

describe('uninstallCursorHooks', () => {
  it('retire les entrées de Leon, garde le reste, et retire l’accord', async () => {
    await writeHooks({
      version: 1,
      hooks: { beforeSubmitPrompt: [prompt()], stop: [userEntry, tour()] },
    });
    await writeConsent(home, 'cursor', 2);

    const { code, out } = await uninstall();

    expect(code).toBe(0);
    expect(await readHooks()).toEqual({ version: 1, hooks: { stop: [userEntry] } });
    expect(out).toContain('nothing is sent from or to Cursor anymore');
    expect(await consentWithdrawn(home, 'cursor')).toBe(true);
  });

  it('sans fichier : rien à retirer, l’accord est quand même retiré', async () => {
    const { code, out } = await uninstall();

    expect(code).toBe(0);
    expect(out).toContain('nothing to remove');
    expect(await consentWithdrawn(home, 'cursor')).toBe(true);
  });

  it('le serveur apprend le retrait de Cursor ; s’il échoue, une ligne, et le retrait local reste fait', async () => {
    await writeConsent(home, 'cursor', 2);
    const told: string[] = [];

    const failed = await uninstall(async () => {
      throw new Error('fetch failed');
    });
    expect(failed.code).toBe(0);
    expect(failed.err).toBe(WITHDRAWAL_NOT_TOLD_LAST_MESSAGE);
    expect(await consentWithdrawn(home, 'cursor')).toBe(true);

    await uninstall(async (outil) => {
      told.push(outil);
    });
    expect(told).toEqual(['cursor']);
    expect(await pendingServerWithdrawals(home)).toEqual([]);
  });
});

// T26 : macOS refuse à Cursor de lancer un script rangé dans Documents, Bureau ou Téléchargements.
describe('protectedCloneWarning', () => {
  it('prévient quand le lanceur lance un clone rangé dans un dossier protégé de macOS', async () => {
    await writeLauncher(home, { kind: 'clone', repoDir: join(home, 'Documents', 'leon') });

    expect(await protectedCloneWarning(home, 'Cursor', 'darwin')).toContain(
      'a clone in ~/Documents',
    );
    expect(await protectedCloneWarning(home, 'Cursor', 'linux')).toBeNull();
  });

  it('rien pour un clone ailleurs, ni pour la forme installée', async () => {
    await writeLauncher(home, { kind: 'clone', repoDir: join(home, 'code', 'leon') });
    expect(await protectedCloneWarning(home, 'Cursor', 'darwin')).toBeNull();

    await writeLauncher(home, { kind: 'installee' }, () => true);
    expect(await protectedCloneWarning(home, 'Cursor', 'darwin')).toBeNull();
  });
});
