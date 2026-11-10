import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consentWithdrawn, factsConsent, pendingServerWithdrawals, writeConsent } from './consent';
import { launcherCommand } from './hook-commands';
import {
  CURSOR_CONSENT_LINES,
  cursorHooksPath,
  installCursorHooks,
  uninstallCursorHooks,
} from './install-cursor';
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

async function install(answers: (string | null)[] = ['oui'], assumeYes = false) {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const code = await installCursorHooks(
    { home, assumeYes },
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
    expect(text).toContain('once per conversation');
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
