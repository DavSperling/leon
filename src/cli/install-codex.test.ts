import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consentWithdrawn, factsConsent, pendingServerWithdrawals, writeConsent } from './consent';
import { launcherCommand, launcherHookCommand, launcherPath } from './hook-commands';
import {
  CODEX_CONSENT_LINES,
  CODEX_HOOKS_FILE,
  installCodexHook,
  uninstallCodexHook,
} from './install-codex';
import { writeLauncher } from './launcher';
import { type UninstallDeps, WITHDRAWAL_NOT_TOLD_MESSAGE } from './uninstall-hooks';

// L'installateur et le retrait des crochets de Codex (T17, T20), toujours sur des dossiers temporaires : jamais le vrai
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
// T20 : Stop en tâche de fond (60 s), SessionEnd (3 s, le plafond de Codex).
const tourHandler = () => ({
  type: 'command',
  command: launcherCommand(home, 'codex', 'tour'),
  timeout: 60,
  async: true,
});
const finHandler = () => ({
  type: 'command',
  command: launcherCommand(home, 'codex', 'fin'),
  timeout: 3,
});
const allLeonHooks = () => ({
  SessionStart: [{ hooks: [leonHandler()] }],
  Stop: [{ hooks: [tourHandler()] }],
  SessionEnd: [{ hooks: [finHandler()] }],
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

// Le serveur de la connexion, simulé : il note les outils dont il apprend le retrait (T43), ou échoue.
async function uninstall(withdraw: UninstallDeps['withdraw'] = async () => {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await uninstallCodexHook(
    { codexDir, home },
    { out: (text) => out.push(text), err: (text) => err.push(text), withdraw },
  );
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('installCodexHook', () => {
  it('ajoute les groupes de Leon en fin de liste, garde ceux de l’utilisateur tels quels, et écrit l’accord', async () => {
    const userStop = { hooks: [{ type: 'command', command: 'x' }] };
    await writeHooks({
      description: 'mes crochets',
      hooks: { SessionStart: [userGroup], Stop: [userStop] },
    });

    const { code, out } = await install();

    expect(code).toBe(0);
    const hooks = await readHooks();
    expect(hooks.description).toBe('mes crochets');
    expect(hooks.hooks.SessionStart).toEqual([userGroup, { hooks: [leonHandler()] }]);
    expect(hooks.hooks.Stop).toEqual([userStop, { hooks: [tourHandler()] }]);
    expect(hooks.hooks.SessionEnd).toEqual([{ hooks: [finHandler()] }]);
    expect(out).toContain('type /hooks and approve the Leon hooks');
    const consent = await factsConsent(home, 'codex');
    expect(consent?.version).toBe(2);
    expect(consent?.capture_le).toBeInstanceOf(Date);
    // Seul Codex a un accord : celui de Claude Code n'est pas touché.
    expect(await factsConsent(home, 'claude_code')).toBeNull();
  });

  it('crée le fichier absent', async () => {
    expect((await install()).code).toBe(0);
    expect(await readHooks()).toEqual({ hooks: allLeonHooks() });
  });

  it('montre chaque crochet, et le texte exact de l’accord, avant de demander', async () => {
    const { out, asked } = await install(['non']);

    for (const line of CODEX_CONSENT_LINES) expect(out).toContain(line);
    expect(out).toContain('  SessionStart · timeout 10 s · add');
    expect(out).toContain('  Stop · timeout 60 s · in the background · add');
    expect(out).toContain('  SessionEnd · timeout 3 s · add');
    expect(out).toContain(`    ${launcherCommand(home, 'codex', 'fin')}`);
    const text = CODEX_CONSENT_LINES.join('\n');
    expect(text).toContain("so it is given to Codex's model");
    expect(text).toContain('the new exchanges of the session');
    expect(text).toContain('never their other arguments');
    expect(text).toContain('only Codex sessions changed after you accept');
    expect(text).not.toContain('Nothing is captured');
    expect(asked).toHaveLength(1);
  });

  // T20 : après le lot 4, le crochet de démarrage est déjà approuvé ; seuls Stop et SessionEnd s'ajoutent.
  it('après le lot 4 : le démarrage garde sa place (donc son approbation), la capture s’ajoute et se date à part', async () => {
    await writeHooks({ hooks: { SessionStart: [userGroup, { hooks: [leonHandler()] }] } });
    await writeConsent(home, 'codex', 2, new Date('2026-11-06T10:00:00Z'));

    const { code, out, asked } = await install();

    expect(code).toBe(0);
    expect(out).toContain('  SessionStart · timeout 10 s · already in place');
    expect(asked[0]).toContain('and record this consent');
    expect(await readHooks()).toEqual({
      hooks: {
        SessionStart: [userGroup, { hooks: [leonHandler()] }],
        Stop: [{ hooks: [tourHandler()] }],
        SessionEnd: [{ hooks: [finHandler()] }],
      },
    });
    const consent = await factsConsent(home, 'codex');
    expect(consent?.installe_le).toEqual(new Date('2026-11-06T10:00:00Z'));
    expect(consent?.capture_le).toBeInstanceOf(Date);
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
    expect(again.out).toContain('The Leon hooks are already in place');
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
    expect((await readHooks()).hooks.Stop).toEqual([{ hooks: [tourHandler()] }]);
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

  it('crochets en place sans accord : ne demande que l’accord, sans toucher au fichier', async () => {
    const text = await writeHooks({ hooks: allLeonHooks() });

    const { code, out } = await install();

    expect(code).toBe(0);
    expect(out).not.toContain('Hooks installed');
    expect(await readFile(hooksPath, 'utf8')).toBe(text);
    expect((await factsConsent(home, 'codex'))?.version).toBe(2);
    expect((await factsConsent(home, 'codex'))?.capture_le).toBeInstanceOf(Date);
  });

  it('un refus de la capture laisse l’accord du lot 4 tel quel', async () => {
    await writeHooks({ hooks: { SessionStart: [{ hooks: [leonHandler()] }] } });
    await writeConsent(home, 'codex', 2);

    expect((await install(['non'])).code).toBe(0);

    expect((await factsConsent(home, 'codex'))?.capture_le).toBeUndefined();
    expect((await readHooks()).hooks.Stop).toBeUndefined();
  });
});

describe('uninstallCodexHook', () => {
  it('retire les crochets de Leon pour Codex, garde le reste, et retire l’accord', async () => {
    await writeHooks({
      hooks: {
        SessionStart: [userGroup, { hooks: [leonHandler()] }],
        Stop: [{ hooks: [tourHandler()] }],
        SessionEnd: [{ hooks: [finHandler()] }],
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

  it('le serveur apprend le retrait de Codex, une fois l’accord retiré sur le poste', async () => {
    await writeConsent(home, 'codex', 2);
    const told: string[] = [];

    await uninstall(async (outil) => {
      expect(await consentWithdrawn(home, outil)).toBe(true);
      told.push(outil);
    });

    expect(told).toEqual(['codex']);
    expect(await pendingServerWithdrawals(home)).toEqual([]);
  });

  it('un serveur qui ne l’apprend pas : une ligne, le retrait local reste fait, code 0', async () => {
    await writeConsent(home, 'codex', 2);

    const { code, err } = await uninstall(async () => {
      throw new Error('Response 404 from the Leon server.');
    });

    expect(code).toBe(0);
    expect(err).toBe(WITHDRAWAL_NOT_TOLD_MESSAGE);
    expect(await consentWithdrawn(home, 'codex')).toBe(true);
    expect(await pendingServerWithdrawals(home)).toEqual(['codex']);
  });
});
