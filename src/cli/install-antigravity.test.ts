import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consentWithdrawn, factsConsent, writeConsent } from './consent';
import { CATCH_UP_WHEN, launcherCommand } from './hook-commands';
import {
  ANTIGRAVITY_CONSENT_LINES,
  antigravityHooksPath,
  installAntigravityHooks,
  uninstallAntigravityHooks,
} from './install-antigravity';
import {
  ANTIGRAVITY_COULISSES_LINES,
  COULISSES_LINES,
  LECTURE_LINES,
  NOTER_LINES,
  RAPPEL_LINES,
  RESUME_LINES,
  type UsageOptions,
} from './install-hooks';

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

// `usages` : le terminal (`interactive`) et les usages déjà tranchés dans le passage (T47).
async function install(answers: (string | null)[] = ['oui'], usages: UsageOptions = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const code = await installAntigravityHooks(
    { home, assumeYes: false, ...usages },
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
    expect(out).toContain('  PreInvocation · timeout 10 s · add');
    expect(out).not.toContain('SessionStart');
    expect(out).toContain('  Stop · timeout 30 s · add');
    expect(out).toContain('restart the app');
    expect((await factsConsent(home, 'antigravity'))?.capture_le).toBeInstanceOf(Date);
  });

  it('montre le texte exact de l’accord ; un refus n’écrit rien', async () => {
    const { out, asked } = await install(['non']);

    for (const line of ANTIGRAVITY_CONSENT_LINES) expect(out).toContain(line);
    const text = ANTIGRAVITY_CONSENT_LINES.join('\n');
    // Décision d'Amos du 17/11 : le rapport d'un sous-agent part sous cet accord, marqué, comme chez Cursor.
    expect(text).toContain(
      "the messages Antigravity writes itself in your place, such as a subagent's report, labeled as written by Antigravity, not by you;",
    );
    // Amendé le 18/11 : les faits relèvent aussi les commits et les PR, le texte les dit comme celui de Codex.
    expect(text).toContain('Git (branch, commits, pull requests)');
    expect(text).toContain("so it is given to Antigravity's model");
    expect(text).toContain('(.pb) and its databases are never read');
    // Décision 4 d'Amos pour le lot 14 : qui lit vraiment la conversation (0057).
    expect(text).toContain(
      'Each conversation is read by you and, on the Leon website, by the managers above you, never by your other colleagues.',
    );
    expect(text).not.toContain('private');
    expect(text).toContain(CATCH_UP_WHEN);
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

  // T31 : l'appli 2.0.1 n'appelle jamais SessionStart ; une entrée d'avant l'essai le perd à la mise à jour.
  it('retire le SessionStart d’une entrée `leon` posée avant l’essai', async () => {
    await writeHooks({ leon: { ...leonEntry(), SessionStart: [handler('demarrage', 10)] } });

    expect((await install()).code).toBe(0);

    expect((await readHooks()).leon).toEqual(leonEntry());
  });

  it('ne réécrit jamais un fichier que JSON.parse refuse (des commentaires), et le dit', async () => {
    const text = await writeHooks('{ // mes crochets\n "a": {} }');

    const { code, err } = await install();

    expect(code).toBe(1);
    expect(err).toContain('Nothing was written');
    expect(await readFile(hooksPath, 'utf8')).toBe(text);
  });
});

// T47 (décisions d'Amos du 11/11) : Antigravity propose `lecture`, `rappel` (depuis l'essai de l'appli 2.0.6 du 11/11),
// puis `resume`, avec les textes de Claude Code, dans un terminal, après l'accord de base et la capture.
describe('installAntigravityHooks : les usages', () => {
  it('dans un terminal, après l’accord : lecture, rappel, noter, coulisses puis resume, écrits pour Antigravity seul', async () => {
    const { code, out, asked } = await install(['oui', 'oui', 'oui', 'oui', null, 'non'], {
      interactive: true,
    });

    expect(code).toBe(0);
    expect(asked).toHaveLength(6);
    expect(out).toContain(LECTURE_LINES.join('\n'));
    expect(out.indexOf(NOTER_LINES.join('\n'))).toBeGreaterThan(
      out.indexOf(RAPPEL_LINES.join('\n')),
    );
    expect(out.indexOf(RESUME_LINES.join('\n'))).toBeGreaterThan(
      out.indexOf(NOTER_LINES.join('\n')),
    );
    expect(out).toContain('`~/.leon/bin/leon retirer-crochets --outil antigravity`');
    expect(await factsConsent(home, 'antigravity')).toMatchObject({
      usages: ['lecture', 'rappel', 'noter'],
      refus: ['resume'],
    });
  });

  it('crochets et capture en place, sans usage : plus de « nothing to do » ; hors terminal, rien', async () => {
    await install();

    expect((await install([])).out).toContain('nothing to do');
    const { out, asked } = await install([null, null, null, null, null], { interactive: true });
    expect(asked).toHaveLength(5);
    expect(out).not.toContain('nothing to do');
  });
  // T52 amendée le 17/11 : `coulisses` se demande pour Antigravity, avec son texte, outil par outil. Un oui donné dans
  // le passage pour un autre outil ne vaut pas pour lui.
  it('coulisses : le texte d’Antigravity, mot pour mot, ses deux dernières puces celles de Claude Code', () => {
    expect(ANTIGRAVITY_COULISSES_LINES.slice(0, 2)).toEqual([
      'Full capture (usage "coulisses", optional, asked separately):',
      "  - Once an Antigravity conversation has not changed for 30 minutes, the Leon server this computer is connected to also receives what happened behind the exchanges: the agent's reasoning, which Antigravity writes in full in the transcript; the instruction given to each subagent and its final report; and each tool call, those of subagents included, reduced to the name of the tool, its target and its status. The target is, for a command, only its executable, plus the subcommand for a fixed list of developer tools; for a file tool, the path in the repository; for any other tool, nothing, and a tool Leon does not know, such as an MCP tool, is kept without its name. Never the output of a tool, nor a search pattern, a URL, a query or any other argument. It is sent in the background the next time Leon's start hook runs on this computer.",
    ]);
    expect(ANTIGRAVITY_COULISSES_LINES.slice(2)).toEqual(COULISSES_LINES.slice(2));
    expect(ANTIGRAVITY_COULISSES_LINES).toHaveLength(4);
  });

  it('coulisses : demandé en [y/N] avec le texte d’Antigravity, avant resume ; un oui l’écrit pour Antigravity seul', async () => {
    const { out, asked } = await install(['oui', null, null, null, 'oui', null], {
      interactive: true,
    });

    expect(asked).toHaveLength(6);
    expect(asked[4]).toBe(
      `\nAlso send Leon what happens behind the exchanges of each Antigravity conversation: the reasoning, the subagents and the reduced tool calls (recorded in ${join(home, '.leon', 'accord.json')})? [y/N] `,
    );
    expect(out).toContain(ANTIGRAVITY_COULISSES_LINES.join('\n'));
    expect(out).not.toContain(COULISSES_LINES[1]);
    expect(await factsConsent(home, 'antigravity')).toMatchObject({
      usages: ['coulisses'],
      refus: [],
    });
  });

  it('coulisses : un oui tranché dans le passage pour un autre outil ne s’écrit pas, la question est posée', async () => {
    const { asked } = await install(['oui', null, null, null, null, null], {
      interactive: true,
      decisions: new Map([['coulisses', true]]),
    });

    expect(asked).toHaveLength(6);
    expect(asked[4]).toContain('each Antigravity conversation');
    expect(await factsConsent(home, 'antigravity')).toMatchObject({ usages: [], refus: [] });
  });

  it('coulisses : ni avec --oui, ni hors terminal', async () => {
    const outside = await install(['oui', 'oui', 'oui', 'oui', 'oui', 'oui']);
    expect(outside.asked).toHaveLength(1);
    expect(outside.out).not.toContain(COULISSES_LINES[0]);

    const out: string[] = [];
    await installAntigravityHooks(
      { home, assumeYes: true, interactive: true },
      { out: (text) => out.push(text), err: () => {}, ask: async () => 'oui' },
    );
    expect(out.join('\n')).not.toContain(COULISSES_LINES[0]);
    expect(await factsConsent(home, 'antigravity')).toMatchObject({ usages: [], refus: [] });
  });
  // T49, amendé le 11/11 au soir : PreInvocation reçoit le message dans l'appli 2.0.6 (annexe 05) ; le crochet déjà posé
  // porte le rappel, sans crochet de plus.
  it('rappel : une décision de la page l’écrit pour Antigravity, sans le redemander ni changer ses crochets', async () => {
    await writeHooks(userEntry);
    const { asked } = await install(['oui', 'non', 'non', null, 'non'], {
      interactive: true,
      decisions: new Map([['rappel', true]]),
    });

    expect(asked).toHaveLength(5);
    expect(asked.some((question) => question.includes('remind'))).toBe(false);
    expect(await factsConsent(home, 'antigravity')).toMatchObject({
      usages: ['rappel'],
      refus: ['lecture', 'resume', 'noter'],
    });
    expect(await readHooks()).toEqual({ ...userEntry, leon: leonEntry() });
  });
});

describe('uninstallAntigravityHooks', () => {
  it('retire la seule entrée `leon`, garde les autres, et retire l’accord', async () => {
    await writeHooks({ ...userEntry, leon: leonEntry() });
    await writeConsent(home, 'antigravity', 2);
    const out: string[] = [];

    const told: string[] = [];

    const code = await uninstallAntigravityHooks(
      { home },
      {
        out: (text) => out.push(text),
        err: () => {},
        // Le serveur de la connexion, simulé (T43) : il apprend le retrait.
        withdraw: async (outil) => {
          told.push(outil);
        },
      },
    );

    expect(code).toBe(0);
    expect(await readHooks()).toEqual(userEntry);
    expect(out.join('\n')).toContain('nothing is sent from or to Antigravity anymore');
    expect(await consentWithdrawn(home, 'antigravity')).toBe(true);
    expect(told).toEqual(['antigravity']);
  });
});
