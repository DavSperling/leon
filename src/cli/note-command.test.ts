import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS, NOTE_TEXTE_MAX } from '../capture/api-contract';
import { SECRET_MASK } from '../capture/mask-secrets';
import { addUsage, writeConsent } from './consent';
import {
  NOTE_CONFLICT_MESSAGE,
  NOTE_REFUSED_MESSAGE,
  NOTE_ROUTE_MISSING_MESSAGE,
  type NoteDeps,
  notesNotAllowedMessage,
  runNoteCommand,
} from './note-command';
import type { GitRunner } from './project-key';

// `leon note` (T57, amendée le 11/11 ; C14, D30, D38) : une note privée de l'agent, ou sa version suivante.

const ENV = { LEON_URL: 'http://localhost:3000', LEON_TOKEN: `leon_${'a'.repeat(43)}` };
const ID = '0b8f2f4e-8c1a-4d2b-9a5e-3c7d1e2f4a6b';
const SESSION = '0a1b2c3d-1111-4222-8333-444455556666';
const FAKE_SECRET = `sk-ant-${'aB3dE5gH7jK9mN1pQ2sT4vW6xY8zC0fL'.slice(0, 30)}`;
// Le texte d'une note, qu'aucun message ne doit recopier.
const TEXTE = 'Reprendre la route des notes N0te-xyz';

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'leon-note-'));
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const git: GitRunner = async (args) =>
  args.join(' ') === 'remote get-url origin' ? 'git@github.com:acme/leon.git' : null;

// Un poste où ces outils ont ces usages.
async function consent(tools: Record<string, Array<'noter' | 'lecture'>>) {
  for (const [tool, usages] of Object.entries(tools)) {
    await writeConsent(home, tool as 'claude_code', 2);
    for (const usage of usages) await addUsage(home, tool as 'claude_code', usage);
  }
}

function setup(
  response: () => Response | Promise<Response> = () =>
    Response.json({ id: ID, n: 1 }, { status: 201 }),
) {
  const out: string[] = [];
  const err: string[] = [];
  const fetchImpl = vi.fn(async (_url: URL, _init?: RequestInit) => response());
  const deps: NoteDeps = {
    env: ENV,
    home,
    cwd: '/projets/leon',
    git,
    fetch: fetchImpl as unknown as typeof fetch,
    out: (text) => out.push(text),
    err: (text) => err.push(text),
  };
  const sent = () => {
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    return { path: url?.pathname, body: JSON.parse(String(init?.body ?? 'null')) };
  };
  return { deps, out, err, fetchImpl, sent };
}

describe('runNoteCommand', () => {
  it('envoie le texte, le projet, l’outil, la session et les usages de cet outil seul ; l’id et le numéro sur la sortie standard', async () => {
    await consent({ claude_code: ['noter', 'lecture'], codex: ['noter'], cursor: ['lecture'] });
    const { deps, out, err, sent } = setup(() => Response.json({ id: ID, n: 1 }, { status: 201 }));

    expect(await runNoteCommand(['--tool', 'codex', '--session', SESSION, TEXTE], deps)).toBe(0);

    expect(sent()).toEqual({
      path: API_PATHS.noter,
      body: {
        projet: 'github.com/acme/leon',
        outil: 'codex',
        session: SESSION,
        texte: TEXTE,
        usages: ['noter'],
      },
    });
    expect(out).toEqual([
      `Note ${ID}, version 1. To write its next version: --note ${ID} --version 1`,
    ]);
    expect(err).toEqual([]);
  });

  it('sans --session ; la version suivante avec --note et --version', async () => {
    await consent({ cursor: ['noter'] });
    const { deps, out, sent } = setup(() => Response.json({ id: ID, n: 3 }, { status: 201 }));

    await runNoteCommand(['--tool', 'cursor', '--note', ID, '--version', '2', 'la', 'suite'], deps);

    expect(sent().body).toEqual({
      projet: 'github.com/acme/leon',
      outil: 'cursor',
      texte: 'la suite',
      note: ID,
      version: 2,
      usages: ['noter'],
    });
    expect(out).toEqual([
      `Note ${ID}, version 3. To write its next version: --note ${ID} --version 3`,
    ]);
  });

  // La phrase du bloc écrit `-- "<texte>"` (render-context.ts) : une note qui commence par une puce ou un tiret n'est
  // pas lue comme une option.
  it.each([
    ['une puce markdown', '- piste 1\n- piste 2'],
    ['deux tirets', '--x reste du texte'],
  ])('un texte après -- qui commence par %s part tel quel', async (_cas, text) => {
    await consent({ claude_code: ['noter'] });
    const { deps, out, sent } = setup();

    expect(
      await runNoteCommand(['--tool', 'claude_code', '--session', SESSION, '--', text], deps),
    ).toBe(0);

    expect(sent().body).toMatchObject({ outil: 'claude_code', session: SESSION, texte: text });
    expect(out).toHaveLength(1);
  });

  it('masque le texte en entier, puis le coupe à 4 000 caractères : un faux secret ne part jamais', async () => {
    await consent({ claude_code: ['noter'] });
    const sentText = async (text: string) => {
      const { deps, sent } = setup();
      await runNoteCommand(['--tool', 'claude_code', text], deps);
      return sent().body.texte as string;
    };

    const masked = await sentText(`avant ${FAKE_SECRET} après`);
    expect(masked).toBe(`avant ${SECRET_MASK} après`);
    const long = await sentText(`${'a'.repeat(NOTE_TEXTE_MAX + 100)}`);
    expect(long).toHaveLength(NOTE_TEXTE_MAX);
    // À cheval sur la borne, coupé avant le masque, il serait trop court pour son motif et partirait en morceau.
    const across = await sentText(`${'a '.repeat((NOTE_TEXTE_MAX - 20) / 2)}${FAKE_SECRET}`);
    expect(across).not.toContain('sk-ant-');
    expect(across.length).toBeLessThanOrEqual(NOTE_TEXTE_MAX);
  });

  it.each([
    ['sans accord', {}],
    ['sans `noter` pour cet outil, même avec `lecture`', { claude_code: ['lecture' as const] }],
    ['avec `noter` pour un autre outil seulement', { codex: ['noter' as const] }],
  ])('%s : rien ne part, un message fixe, le code 0', async (_cas, tools) => {
    await consent(tools);
    const { deps, out, err, fetchImpl } = setup();

    expect(await runNoteCommand(['--tool', 'claude_code', TEXTE], deps)).toBe(0);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out).toEqual([]);
    expect(err).toEqual([notesNotAllowedMessage('claude_code')]);
  });

  it.each([
    ['un serveur ancien (404)', 404, NOTE_ROUTE_MISSING_MESSAGE],
    ['un refus (403)', 403, NOTE_REFUSED_MESSAGE],
    ['une version dépassée ou un autre outil (409)', 409, NOTE_CONFLICT_MESSAGE],
    [
      'une demande refusée (400)',
      400,
      'Leon: the Leon server refused this note as invalid: nothing was saved.',
    ],
    ['un jeton refusé (401)', 401, 'Leon: token refused by the Leon server.'],
    ['une autre réponse (500)', 500, 'Leon: leon note unavailable (response 500 from the server).'],
  ])(
    '%s : un message fixe sur la sortie d’erreur, sans le texte de la note, et le code 0',
    async (_cas, status, message) => {
      await consent({ claude_code: ['noter'] });
      const { deps, out, err } = setup(
        () => new Response(JSON.stringify({ error: `écho ${TEXTE}` }), { status }),
      );

      expect(await runNoteCommand(['--tool', 'claude_code', TEXTE], deps)).toBe(0);

      expect(out).toEqual([]);
      expect(err).toEqual([message]);
      expect(err.join('\n')).not.toContain('N0te-xyz');
    },
  );

  it('un serveur injoignable, ou une réponse inattendue : un message fixe, le code 0', async () => {
    await consent({ claude_code: ['noter'] });
    const down = setup(() => Promise.reject(new TypeError('fetch failed')));
    const odd = setup(() => Response.json({ id: 'pas-un-uuid' }, { status: 201 }));

    expect(await runNoteCommand(['--tool', 'claude_code', TEXTE], down.deps)).toBe(0);
    expect(await runNoteCommand(['--tool', 'claude_code', TEXTE], odd.deps)).toBe(0);

    expect(down.err).toEqual(['Leon: leon note unavailable (server unreachable or too slow).']);
    expect(odd.err).toEqual(['Leon: leon note unavailable (unexpected response from the server).']);
    expect([...down.out, ...odd.out]).toEqual([]);
  });

  it('n’écrit rien sur le disque, même après une note écrite', async () => {
    await consent({ claude_code: ['noter'] });
    const before = await readdir(home, { recursive: true });
    const { deps } = setup();

    await runNoteCommand(['--tool', 'claude_code', TEXTE], deps);

    expect(await readdir(home, { recursive: true })).toEqual(before);
  });

  it.each([
    [[TEXTE], /--tool/],
    [['--tool', 'vscode', TEXTE], /--tool/],
    [['--tool', 'claude_code'], /text/],
    [['--tool', 'claude_code', '  '], /text/],
    [['--tool', 'claude_code', '--session', 's'.repeat(201), TEXTE], /--session/],
    [['--tool', 'claude_code', '--note', ID, TEXTE], /--note and --version/],
    [['--tool', 'claude_code', '--version', '2', TEXTE], /--note and --version/],
    [['--tool', 'claude_code', '--note', 'x', '--version', '2', TEXTE], /--note/],
    [['--tool', 'claude_code', '--note', ID, '--version', '0', TEXTE], /--version/],
    [['--tool', 'claude_code', '--inconnue', TEXTE], /./],
  ])('une erreur d’usage (%j) lève, sans rien envoyer', async (args, message) => {
    await consent({ claude_code: ['noter'] });
    const { deps, fetchImpl } = setup();

    await expect(runNoteCommand(args, deps)).rejects.toThrow(message);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('une note trop longue pour la route une fois en JSON : refusée ici, sans rien envoyer', async () => {
    await consent({ claude_code: ['noter'] });
    const { deps, fetchImpl } = setup();

    // Chaque caractère de contrôle pèse six octets en JSON : 4 000 dépassent les 16 Kio de la route.
    await expect(
      runNoteCommand(['--tool', 'claude_code', '\u0001'.repeat(NOTE_TEXTE_MAX)], deps),
    ).rejects.toThrow(/too long/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
