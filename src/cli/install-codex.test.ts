import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consentWithdrawn, factsConsent, pendingServerWithdrawals, writeConsent } from './consent';
import { CATCH_UP_WHEN, launcherCommand, launcherHookCommand, launcherPath } from './hook-commands';
import {
  CODEX_CONSENT_LINES,
  CODEX_HOOKS_FILE,
  installCodexHook,
  uninstallCodexHook,
} from './install-codex';
import {
  LECTURE_LINES,
  NOTER_LINES,
  RAPPEL_LINES,
  RESUME_LINES,
  type UsageOptions,
} from './install-hooks';
import { writeLauncher } from './launcher';
import { type UninstallDeps, WITHDRAWAL_NOT_TOLD_LAST_MESSAGE } from './uninstall-hooks';

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
// T49 : le crochet de message (5 s), posé seulement avec l'usage `rappel`.
const promptHandler = () => ({
  type: 'command',
  command: launcherCommand(home, 'codex', 'prompt'),
  timeout: 5,
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

// `usages` : le terminal (`interactive`) et les usages déjà tranchés dans le passage (T47).
async function install(
  answers: (string | null)[] = ['oui'],
  assumeYes = false,
  usages: UsageOptions = {},
) {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const code = await installCodexHook(
    { codexDir, home, assumeYes, ...usages },
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
    expect(text).toContain('labeled as written by Codex, not by you');
    expect(text).toContain("so it is given to Codex's model");
    expect(text).toContain('the new exchanges of the session');
    expect(text).toContain('never their other arguments');
    expect(text).toContain('only Codex sessions changed after you accept');
    expect(text).toContain(CATCH_UP_WHEN);
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

// T47 (décisions d'Amos du 11/11) : Codex propose `lecture` puis `resume`, avec les textes de Claude Code, dans un
// terminal, après l'accord de base et la capture ; ils s'écrivent sous l'entrée de Codex seule.
describe('installCodexHook : les usages', () => {
  const terminal = { interactive: true };
  const rawEntry = async (tool = 'codex') =>
    JSON.parse(await readFile(join(home, '.leon', 'accord.json'), 'utf8')).outils[tool];

  it('dans un terminal, après l’accord : lecture, rappel, noter puis resume, avec les mêmes textes, écrits pour Codex seul', async () => {
    await writeConsent(home, 'claude_code', 2);

    const { code, out, asked } = await install(
      ['oui', '', 'plus tard', 'plus tard', 'oui'],
      false,
      terminal,
    );

    expect(code).toBe(0);
    expect(asked).toHaveLength(5);
    expect(asked[1]).toContain('[Y/n]');
    expect(asked[2]).toContain('[Y/n]');
    expect(asked[3]).toContain('[Y/n]');
    expect(asked[4]).toContain('[y/N]');
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
    expect(await factsConsent(home, 'codex')).toMatchObject({ usages: ['lecture', 'resume'] });
    expect(await rawEntry('claude_code')).toEqual({ version: 2, installe_le: expect.any(String) });
  });

  it('crochets et capture en place, sans usage : plus de « nothing to do » ; un refus cite --outil codex', async () => {
    await install();
    const hooks = await readFile(hooksPath, 'utf8');

    const { code, out } = await install(['non', 'non', 'non', 'non'], false, terminal);

    expect(code).toBe(0);
    expect(out).toContain(`The Leon hooks are already in place in ${hooksPath}.`);
    expect(out).not.toContain('nothing to do');
    expect(out).toContain(
      'This answer is kept: you will not be asked again. To change it, run `~/.leon/bin/leon retirer-crochets --outil codex` (it also removes the hooks of this tool and withdraws its consent), then `~/.leon/bin/leon setup` again.',
    );
    expect(await factsConsent(home, 'codex')).toMatchObject({
      usages: [],
      refus: ['lecture', 'rappel', 'resume', 'noter'],
    });
    expect(await readFile(hooksPath, 'utf8')).toBe(hooks);

    const again = await install([], false, terminal);

    expect(again.asked).toEqual([]);
    expect(again.out).toContain('nothing to do');
  });

  it('la capture refusée : aucun usage n’est proposé', async () => {
    const { asked } = await install(['non', 'oui', 'oui'], false, terminal);

    expect(asked).toHaveLength(1);
    expect(await factsConsent(home, 'codex')).toBeNull();
  });

  it.each([
    ['hors terminal, même avec « y »', ['oui', '', 'y'], false, {}],
    ['avec --oui, même dans un terminal', [], true, terminal],
  ])('%s : ni question ni usage', async (_name, answers, assumeYes, usages) => {
    const { out, asked } = await install(answers, assumeYes, usages);

    expect(asked.length).toBeLessThanOrEqual(1);
    expect(out).not.toContain(LECTURE_LINES[0]);
    expect(await factsConsent(home, 'codex')).toMatchObject({ usages: [], refus: [] });
  });

  it('une décision du passage s’écrit sans question (la page « Autoriser », setup)', async () => {
    const { asked } = await install(['oui'], false, {
      decisions: new Map([
        ['lecture', true],
        ['resume', false],
      ]),
    });

    expect(asked).toHaveLength(1);
    expect(await factsConsent(home, 'codex')).toMatchObject({
      usages: ['lecture'],
      refus: ['resume'],
    });
  });

  it('le retrait efface usages, refus et capture ; une réinstallation dans un terminal les repropose', async () => {
    await install(['oui', 'oui', 'oui', 'non'], false, terminal);

    await uninstall();

    expect(await rawEntry()).toEqual({ version: 0, installe_le: expect.any(String) });
    expect((await readHooks()).hooks).toBeUndefined();
    const again = await install(['oui', null, null, null, null], false, terminal);
    expect(again.asked).toHaveLength(5);
  });
});

// T49 (décisions d'Amos du 11/11 pour le lot 13) : le rappel de Codex passe par un crochet UserPromptSubmit
// (`leon crochet codex prompt`, 5 s), posé seulement avec l'usage `rappel`, en fin de liste, à approuver par /hooks.
describe('installCodexHook : l’usage rappel et son crochet', () => {
  const terminal = { interactive: true };

  it('accepté dans un terminal, avec le texte de Claude Code : le crochet est posé, et il faut l’approuver', async () => {
    const { code, out } = await install(['oui', 'non', '', 'non'], false, terminal);

    expect(code).toBe(0);
    expect(out).toContain(RAPPEL_LINES.join('\n'));
    expect(await factsConsent(home, 'codex')).toMatchObject({ usages: ['rappel'] });
    expect((await readHooks()).hooks).toEqual({
      ...allLeonHooks(),
      UserPromptSubmit: [{ hooks: [promptHandler()] }],
    });
    expect(out.lastIndexOf('type /hooks and approve the Leon hooks')).toBeGreaterThan(
      out.indexOf('Reminder recorded'),
    );
  });

  it.each([
    ['refusé', ['oui', 'non', 'non', 'non'], false, terminal],
    ['l’entrée fermée', ['oui', null, null, null], false, terminal],
    ['avec --oui', [], true, terminal],
  ])('%s : pas de crochet de message', async (_name, answers, assumeYes, usages) => {
    await install(answers, assumeYes, usages);

    expect((await readHooks()).hooks.UserPromptSubmit).toBeUndefined();
  });

  it('donné par la page, crochets déjà approuvés : ajouté en fin de liste, sans déplacer les autres', async () => {
    const userPrompt = { hooks: [{ type: 'command', command: './relire.sh' }] };
    await install();
    const before = await readHooks();
    await writeHooks({ ...before, hooks: { ...before.hooks, UserPromptSubmit: [userPrompt] } });

    const { code, out } = await install([], true, { decisions: new Map([['rappel', true]]) });

    expect(code).toBe(0);
    expect(out).toContain('type /hooks and approve the Leon hooks');
    expect((await readHooks()).hooks).toEqual({
      ...before.hooks,
      UserPromptSubmit: [userPrompt, { hooks: [promptHandler()] }],
    });

    const again = await install([], true);
    expect(again.out).toContain('nothing to do');
  });

  it('le retrait l’enlève avec les autres', async () => {
    await install(['oui', 'non', '', 'non'], false, terminal);

    await uninstall();

    expect((await readHooks()).hooks).toBeUndefined();
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
    expect(err).toBe(WITHDRAWAL_NOT_TOLD_LAST_MESSAGE);
    expect(await consentWithdrawn(home, 'codex')).toBe(true);
    expect(await pendingServerWithdrawals(home)).toEqual(['codex']);
  });
});
