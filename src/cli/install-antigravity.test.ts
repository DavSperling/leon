import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consentWithdrawn, factsConsent, writeConsent } from './consent';
import { launcherCommand } from './hook-commands';
import {
  ANTIGRAVITY_CONSENT_LINES,
  antigravityHooksPath,
  installAntigravityHooks,
  uninstallAntigravityHooks,
} from './install-antigravity';

// L'installateur et le retrait des crochets d'Antigravity (T34), toujours dans un HOME temporaire : jamais le vrai
// ~/.gemini.

let dir: string;
let home: string;
let hooksPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'leon-install-agy-'));
  home = join(dir, 'home');
  hooksPath = antigravityHooksPath(home);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const handler = (evenement: 'demarrage' | 'prompt' | 'tour', timeout: number) => ({
  type: 'command',
  command: launcherCommand(home, 'antigravity', evenement),
  timeout,
});
const leonEntry = () => ({
  enabled: true,
  SessionStart: [handler('demarrage', 10)],
  PreInvocation: [handler('prompt', 10)],
  Stop: [handler('tour', 30)],
});
const userEntry = {
  'mes-notes': {
    SessionStart: [{ type: 'command', command: 'python3 ./hooks/notes.py', timeout: 5 }],
    enabled: true,
  },
};

async function writeHooks(content: unknown): Promise<string> {
  const text = typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`;
  await mkdir(join(home, '.gemini', 'config'), { recursive: true });
  await writeFile(hooksPath, text);
  return text;
}
const readHooks = async () => JSON.parse(await readFile(hooksPath, 'utf8'));

async function install(answers: (string | null)[] = ['oui']) {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const code = await installAntigravityHooks(
    { home, assumeYes: false },
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

describe('installAntigravityHooks', () => {
  it('écrit l’entrée `leon`, garde les autres entrées, et l’accord de capture', async () => {
    await writeHooks(userEntry);

    const { code, out } = await install();

    expect(code).toBe(0);
    expect(await readHooks()).toEqual({ ...userEntry, leon: leonEntry() });
    expect(out).toContain('  SessionStart · timeout 10 s · add');
    expect(out).toContain('  PreInvocation · timeout 10 s · add');
    expect(out).toContain('  Stop · timeout 30 s · add');
    expect(out).toContain('restart the app');
    expect((await factsConsent(home, 'antigravity'))?.capture_le).toBeInstanceOf(Date);
  });

  it('montre le texte exact de l’accord ; un refus n’écrit rien', async () => {
    const { out, asked } = await install(['non']);

    for (const line of ANTIGRAVITY_CONSENT_LINES) expect(out).toContain(line);
    const text = ANTIGRAVITY_CONSENT_LINES.join('\n');
    expect(text).toContain("so it is given to Antigravity's model");
    expect(text).toContain('(.pb) and its databases are never read');
    expect(asked).toHaveLength(1);
    await expect(readFile(hooksPath)).rejects.toThrow();
    expect(await factsConsent(home, 'antigravity')).toBeNull();
  });

  it('est idempotente, et remet à sa forme une entrée `leon` retouchée', async () => {
    await writeHooks({ leon: { ...leonEntry(), enabled: false } });

    const first = await install();
    expect(first.out).toContain('update');
    expect((await readHooks()).leon).toEqual(leonEntry());

    const before = await readFile(hooksPath, 'utf8');
    const again = await install([]);
    expect(again.asked).toEqual([]);
    expect(again.out).toContain('already in place');
    expect(await readFile(hooksPath, 'utf8')).toBe(before);
  });

  it('ne réécrit jamais un fichier que JSON.parse refuse (des commentaires), et le dit', async () => {
    const text = await writeHooks('{ // mes crochets\n "a": {} }');

    const { code, err } = await install();

    expect(code).toBe(1);
    expect(err).toContain('Nothing was written');
    expect(await readFile(hooksPath, 'utf8')).toBe(text);
  });
});

describe('uninstallAntigravityHooks', () => {
  it('retire la seule entrée `leon`, garde les autres, et retire l’accord', async () => {
    await writeHooks({ ...userEntry, leon: leonEntry() });
    await writeConsent(home, 'antigravity', 2);
    const out: string[] = [];

    const code = await uninstallAntigravityHooks(
      { home },
      { out: (text) => out.push(text), err: () => {} },
    );

    expect(code).toBe(0);
    expect(await readHooks()).toEqual(userEntry);
    expect(out.join('\n')).toContain('nothing is sent from or to Antigravity anymore');
    expect(await consentWithdrawn(home, 'antigravity')).toBe(true);
  });
});
