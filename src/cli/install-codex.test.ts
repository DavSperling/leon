import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consentWithdrawn, factsConsent, writeConsent } from './consent';
import { launcherCommand, launcherHookCommand, launcherPath } from './hook-commands';
import {
  CODEX_CONSENT_LINES,
  CODEX_HOOKS_FILE,
  installCodexHook,
  uninstallCodexHook,
} from './install-codex';
import { writeLauncher } from './launcher';

// L'installateur et le retrait du crochet de Codex (T17), toujours sur des dossiers temporaires : jamais le vrai
// ~/.codex ni le vrai ~/.leon.

let dir: string;
let home: string;
let codexDir: string;
let hooksPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'leon-install-codex-'));
  home = join(dir, 'home');
  codexDir = join(dir, 'codex');
  hooksPath = join(codexDir, CODEX_HOOKS_FILE);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const leonHandler = () => ({
  type: 'command',
  command: launcherCommand(home, 'codex', 'demarrage'),
  timeout: 10,
  additionalContextLimit: 8000,
});
const userGroup = {
  matcher: 'startup|resume',
  hooks: [{ type: 'command', command: 'python3 ~/.codex/hooks/notes.py', statusMessage: 'Notes' }],
};

async function writeHooks(content: unknown): Promise<string> {
  const text = typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`;
  await mkdir(codexDir, { recursive: true });
  await writeFile(hooksPath, text);
  return text;
}
const readHooks = async () => JSON.parse(await readFile(hooksPath, 'utf8'));

async function install(answers: (string | null)[] = ['oui'], assumeYes = false) {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const code = await installCodexHook(
    { codexDir, home, assumeYes },
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

async function uninstall() {
  const out: string[] = [];
  const err: string[] = [];
  const code = await uninstallCodexHook(
    { codexDir, home },
    { out: (text) => out.push(text), err: (text) => err.push(text) },
  );
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('installCodexHook', () => {
  it('ajoute le groupe de Leon en fin de liste, garde ceux de l’utilisateur tels quels, et écrit l’accord', async () => {
    await writeHooks({
      description: 'mes crochets',
      hooks: { SessionStart: [userGroup], Stop: [{ hooks: [{ type: 'command', command: 'x' }] }] },
    });

    const { code, out } = await install();

    expect(code).toBe(0);
    const hooks = await readHooks();
    expect(hooks.description).toBe('mes crochets');
    expect(hooks.hooks.SessionStart).toEqual([userGroup, { hooks: [leonHandler()] }]);
    expect(hooks.hooks.Stop).toEqual([{ hooks: [{ type: 'command', command: 'x' }] }]);
    expect(out).toContain('type /hooks and approve the Leon hook');
    const consent = await factsConsent(home, 'codex');
    expect(consent?.version).toBe(2);
    // Seul Codex a un accord : celui de Claude Code n'est pas touché.
    expect(await factsConsent(home, 'claude_code')).toBeNull();
  });

  it('crée le fichier absent', async () => {
    expect((await install()).code).toBe(0);
    expect(await readHooks()).toEqual({ hooks: { SessionStart: [{ hooks: [leonHandler()] }] } });
  });

  it('montre le texte exact de l’accord avant de demander', async () => {
    const { out, asked } = await install(['non']);

    for (const line of CODEX_CONSENT_LINES) expect(out).toContain(line);
    expect(CODEX_CONSENT_LINES.join('\n')).toContain("so it is given to Codex's model");
    expect(asked).toHaveLength(1);
  });

  it('un refus n’écrit rien', async () => {
    const { code, out } = await install(['non']);

    expect(code).toBe(0);
    expect(out).toContain('Nothing was written.');
    await expect(readFile(hooksPath)).rejects.toThrow();
    expect(await factsConsent(home, 'codex')).toBeNull();
  });

  it('est idempotent : relancée, elle n’écrit rien et ne demande rien', async () => {
    await install();
    const before = await readFile(hooksPath, 'utf8');

    const again = await install([]);

    expect(again.code).toBe(0);
    expect(again.asked).toEqual([]);
    expect(again.out).toContain('already in place');
    expect(await readFile(hooksPath, 'utf8')).toBe(before);
  });

  it('met à jour sur place une entrée de Leon d’une autre forme, et retire les doublons', async () => {
    const old = {
      type: 'command',
      command: launcherCommand(home, 'codex', 'demarrage'),
      timeout: 5,
    };
    await writeHooks({
      hooks: { SessionStart: [{ hooks: [old] }, userGroup, { hooks: [old] }] },
    });

    expect((await install()).code).toBe(0);

    expect((await readHooks()).hooks.SessionStart).toEqual([{ hooks: [leonHandler()] }, userGroup]);
  });

  it('ne réécrit jamais un fichier illisible', async () => {
    const text = await writeHooks('{ "hooks": { // commentaire\n } }');

    const { code, err } = await install();

    expect(code).toBe(1);
    expect(err).toContain('Nothing was written');
    expect(await readFile(hooksPath, 'utf8')).toBe(text);
  });

  it('avertit des tables [[hooks.*]] de config.toml et des crochets de Claude Code recopiés', async () => {
    await writeHooks({
      hooks: {
        SessionStart: [
          { hooks: [{ type: 'command', command: launcherHookCommand(home, 'briefing') }] },
        ],
      },
    });
    await writeFile(
      join(codexDir, 'config.toml'),
      '[hooks.state]\n\n[[hooks.SessionStart]]\nmatcher = "^compact$"\n',
    );

    const { out } = await install(['non']);

    expect(out).toContain('also has [[hooks.*]] tables');
    expect(out).toContain('probably copied by Codex');
  });

  it('n’avertit pas pour la seule table [hooks.state] de Codex', async () => {
    await mkdir(codexDir, { recursive: true });
    await writeFile(join(codexDir, 'config.toml'), '[hooks.state]\n[hooks.state."x"]\n');

    expect((await install(['non'])).out).not.toContain('[[hooks.*]]');
  });

  it('crochet en place sans accord : ne demande que l’accord, sans toucher au fichier', async () => {
    const text = await writeHooks({ hooks: { SessionStart: [{ hooks: [leonHandler()] }] } });

    const { code } = await install();

    expect(code).toBe(0);
    expect(await readFile(hooksPath, 'utf8')).toBe(text);
    expect((await factsConsent(home, 'codex'))?.version).toBe(2);
  });
});

describe('uninstallCodexHook', () => {
  it('retire les crochets de Leon pour Codex, garde le reste, et retire l’accord', async () => {
    await writeHooks({
      hooks: {
        SessionStart: [userGroup, { hooks: [leonHandler()] }],
        Stop: [{ hooks: [{ type: 'command', command: launcherCommand(home, 'codex', 'tour') }] }],
      },
    });
    await writeConsent(home, 'codex', 2);

    const { code, out } = await uninstall();

    expect(code).toBe(0);
    expect(await readHooks()).toEqual({ hooks: { SessionStart: [userGroup] } });
    expect(out).toContain('Consent withdrawn');
    expect(await consentWithdrawn(home, 'codex')).toBe(true);
  });

  it('efface le lanceur quand plus aucun outil ne s’en sert, et le garde sinon', async () => {
    await writeLauncher(home, { kind: 'installee' });
    await writeConsent(home, 'claude_code', 2);
    await writeConsent(home, 'codex', 2);
    await writeHooks({ hooks: { SessionStart: [{ hooks: [leonHandler()] }] } });

    await uninstall();
    expect(await readFile(launcherPath(home), 'utf8')).toContain('#!/bin/sh');

    await writeConsent(home, 'claude_code', 0);
    await uninstall();
    await expect(readFile(launcherPath(home))).rejects.toThrow();
  });

  it('sans fichier : rien à retirer, l’accord est quand même retiré', async () => {
    const { code, out } = await uninstall();

    expect(code).toBe(0);
    expect(out).toContain('nothing to remove');
    expect(await consentWithdrawn(home, 'codex')).toBe(true);
  });
});
