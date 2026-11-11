import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  API_PATHS,
  RAPPEL_MESSAGE_MAX,
  type RappelRequest,
  RappelRequestSchema,
} from '../capture/api-contract';
import { SECRET_MASK } from '../capture/mask-secrets';
import { addUsage, writeConsent } from './consent';
import type { GitRunner } from './project-key';
import { askReminder, REMINDER_TIMEOUT_MS, runReminder } from './reminder';

const env = { url: 'http://localhost:3000', token: `leon_${'a'.repeat(43)}` };
const serverEnv = { LEON_URL: env.url, LEON_TOKEN: env.token };
const SESSION = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const LINE =
  '<rappel-leon>Le fil de la branche amos/etude (id 3f2a) touche à ce message.</rappel-leon>';
// Un faux secret assemblé à l'exécution : aucun jeton réaliste n'est écrit dans le dépôt.
const FAKE_SECRET = `sk-ant-${'aB3dE5gH7jK9mN1pQ2sT4vW6xY8zC0fL'.slice(0, 30)}`;

const asFetch = (fn: unknown) => fn as typeof fetch;
const answering = (response: () => Response) => vi.fn(async () => response());
// Un serveur qui ne répond jamais : seul le signal de la requête le fait sortir.
const neverAnswers = (_url: URL, init: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  });
const bodyOf = (fetchImpl: ReturnType<typeof vi.fn>): RappelRequest => {
  const [, init] = (fetchImpl.mock.calls[0] ?? []) as unknown as [URL, RequestInit];
  return RappelRequestSchema.parse(JSON.parse(String(init.body)));
};

afterEach(() => vi.restoreAllMocks());

// L'accord local (C7) de chaque cas, dans des HOME temporaires : jamais le vrai ~/.leon.
let homes: string;
let withRappel: string;
let withoutRappel: string;
let withdrawn: string;
let codexHome: string;
beforeAll(async () => {
  homes = await mkdtemp(join(tmpdir(), 'leon-rappel-'));
  withRappel = join(homes, 'avec');
  withoutRappel = join(homes, 'sans');
  withdrawn = join(homes, 'retire');
  codexHome = join(homes, 'codex');
  await writeConsent(withRappel, 'claude_code', 2);
  await addUsage(withRappel, 'claude_code', 'lecture');
  await addUsage(withRappel, 'claude_code', 'rappel');
  await writeConsent(withoutRappel, 'claude_code', 2);
  await addUsage(withoutRappel, 'claude_code', 'lecture');
  await writeConsent(withdrawn, 'claude_code', 0);
  await writeConsent(codexHome, 'codex', 2);
});
afterAll(() => rm(homes, { recursive: true, force: true }));

describe('askReminder', () => {
  const consent = (usages: ('lecture' | 'rappel')[]) => ({
    version: 2,
    installe_le: new Date('2026-11-11T10:00:00Z'),
    usages,
    usages_le: {},
    refus: [],
  });
  const ask = (
    fetchImpl: unknown,
    over: Partial<Parameters<typeof askReminder>[0]> = {},
  ): Promise<string> =>
    askReminder({
      fetch: asFetch(fetchImpl),
      server: env,
      consent: consent(['lecture', 'rappel']),
      outil: 'claude_code',
      projet: 'github.com/acme/leon',
      branche: 'amos/etude',
      session: SESSION,
      message: 'où en est la branche etude ?',
      ...over,
    });

  it('envoie le corps de C8 avec le jeton, et rend la ligne', async () => {
    const fetchImpl = answering(() => Response.json({ texte: LINE }));

    expect(await ask(fetchImpl)).toBe(LINE);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe(new URL(API_PATHS.rappel, env.url).href);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: `Bearer ${env.token}`,
      'Content-Type': 'application/json',
    });
    expect(bodyOf(fetchImpl)).toEqual({
      projet: 'github.com/acme/leon',
      branche: 'amos/etude',
      session: SESSION,
      message: 'où en est la branche etude ?',
      outil: 'claude_code',
      usages: ['lecture', 'rappel'],
    });
  });

  it.each([
    ['aucun accord', null],
    ['un accord sans usage', consent([])],
    ['un accord sans rappel', consent(['lecture'])],
  ])('sans l’usage rappel (%s) : aucune requête', async (_name, accord) => {
    const fetchImpl = answering(() => Response.json({ texte: LINE }));

    expect(await ask(fetchImpl, { consent: accord })).toBe('');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('un message vide ne part pas', async () => {
    const fetchImpl = answering(() => Response.json({ texte: LINE }));

    expect(await ask(fetchImpl, { message: '' })).toBe('');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('coupe le message à 2 000 caractères puis le masque : un faux secret ne part jamais', async () => {
    const fetchImpl = answering(() => Response.json({ texte: '' }));
    const message = `${'a '.repeat(900)}${FAKE_SECRET} ${'b'.repeat(500)}`;

    await ask(fetchImpl, { message });

    const sent = bodyOf(fetchImpl).message;
    expect(sent).toContain(SECRET_MASK);
    expect(sent).not.toContain(FAKE_SECRET);
    expect(sent.length).toBeLessThanOrEqual(RAPPEL_MESSAGE_MAX);

    // Le secret au-delà des 2 000 premiers caractères n'est même pas lu.
    const far = answering(() => Response.json({ texte: '' }));
    await ask(far, { message: `${'a'.repeat(RAPPEL_MESSAGE_MAX)}${FAKE_SECRET}` });
    expect(bodyOf(far).message).toBe('a'.repeat(RAPPEL_MESSAGE_MAX));
  });

  it('un message qui grossit en étant masqué reste sous la borne du serveur', async () => {
    const fetchImpl = answering(() => Response.json({ texte: '' }));
    // Chaque « ;Pwd=a » devient « ;Pwd=[secret masqué] » : le texte masqué est plus long que celui d'origine.
    await ask(fetchImpl, { message: ';Pwd=a'.repeat(500) });

    const sent = bodyOf(fetchImpl).message;
    expect(sent).toContain(SECRET_MASK);
    expect(sent.length).toBeLessThanOrEqual(RAPPEL_MESSAGE_MAX);
  });

  it.each([
    ['un 404 (serveur ancien)', () => new Response('{}', { status: 404 })],
    ['un 400 (serveur ancien)', () => new Response('{}', { status: 400 })],
    ['un 401', () => new Response('{}', { status: 401 })],
    ['un 500', () => new Response('{}', { status: 500 })],
    ['un corps non conforme', () => Response.json({ texte: 3 })],
    ['un corps non JSON', () => new Response('<html>', { status: 200 })],
  ])('rend vide sur %s', async (_name, response) => {
    expect(await ask(answering(response))).toBe('');
  });

  it('rend vide quand la connexion est refusée', async () => {
    const refused = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });

    expect(await ask(refused)).toBe('');
  });

  it('un seul signal de 1,5 s pour toute la demande', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');

    await ask(answering(() => Response.json({ texte: LINE })));

    expect(REMINDER_TIMEOUT_MS).toBe(1500);
    expect(timeout).toHaveBeenCalledTimes(1);
    expect(timeout).toHaveBeenCalledWith(1500);
  });

  it('un serveur lent : vide en moins de 2 s', async () => {
    const started = Date.now();

    expect(await ask(neverAnswers)).toBe('');

    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('runReminder', () => {
  const hookJson = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      session_id: SESSION,
      hook_event_name: 'UserPromptSubmit',
      cwd: '/projets/leon',
      prompt: 'où en est la branche etude ?',
      ...extra,
    });

  function setup(input: {
    stdin: string;
    home?: string;
    env?: Record<string, string | undefined>;
    fetch?: unknown;
  }) {
    const out: string[] = [];
    const err: string[] = [];
    const fetchImpl = input.fetch ?? answering(() => Response.json({ texte: LINE }));
    const git: GitRunner = vi.fn(async (args: string[]) =>
      args[0] === 'branch' ? 'amos/etude' : 'git@github.com:Acme/Leon.git',
    );
    const run = () =>
      runReminder({
        stdin: Readable.from([input.stdin]),
        env: input.env ?? serverEnv,
        cwd: '/leon',
        home: input.home ?? withRappel,
        git,
        fetch: asFetch(fetchImpl),
        out: (text) => out.push(text),
        err: (text) => err.push(text),
      });
    return { run, out, err, git, fetchImpl: fetchImpl as ReturnType<typeof vi.fn> };
  }

  it('lit le message du JSON du crochet, le demande pour le projet et la branche du cwd, et écrit la ligne seule', async () => {
    const { run, out, err, fetchImpl } = setup({ stdin: hookJson() });

    expect(await run()).toBe(0);

    expect(out).toEqual([LINE]);
    expect(err).toEqual([]);
    expect(bodyOf(fetchImpl)).toMatchObject({
      projet: 'github.com/acme/leon',
      branche: 'amos/etude',
      session: SESSION,
      message: 'où en est la branche etude ?',
      outil: 'claude_code',
    });
  });

  it('un texte vide du serveur : rien sur la sortie standard', async () => {
    const { run, out } = setup({
      stdin: hookJson(),
      fetch: answering(() => Response.json({ texte: '' })),
    });

    expect(await run()).toBe(0);
    expect(out).toEqual([]);
  });

  it.each([
    ['sans l’usage rappel', () => ({ home: withoutRappel })],
    ['sans accord', () => ({ home: join(homes, 'absent') })],
    ['l’accord retiré', () => ({ home: withdrawn })],
  ])('%s : rien ne part, rien ne s’écrit, code 0', async (_name, over) => {
    const { run, out, fetchImpl, git } = setup({ stdin: hookJson(), ...over() });

    expect(await run()).toBe(0);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(git).not.toHaveBeenCalled();
    expect(out).toEqual([]);
  });

  it.each([
    [
      'une entrée Cursor (cursor_version)',
      () => hookJson({ cursor_version: '3.29.9' }),
      () => serverEnv,
    ],
    ['CURSOR_VERSION', () => hookJson(), () => ({ ...serverEnv, CURSOR_VERSION: '3.29.9' })],
    [
      'un transcript de Codex',
      () => hookJson({ transcript_path: `${homes}/.codex/sessions/2026/11/11/rollout.jsonl` }),
      () => ({ ...serverEnv, CODEX_HOME: join(homes, '.codex') }),
    ],
  ])('lancée par un autre outil (%s) : rien du tout', async (_name, stdin, env) => {
    const { run, out, err, fetchImpl } = setup({ stdin: stdin(), env: env() });

    expect(await run()).toBe(0);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out).toEqual([]);
    expect(err).toEqual([]);
  });

  it.each([
    ['sans message', () => hookJson({ prompt: '' })],
    ['sans champ prompt', () => JSON.stringify({ session_id: SESSION, cwd: '/projets/leon' })],
    ['sans session', () => JSON.stringify({ prompt: 'bonjour', cwd: '/projets/leon' })],
    ['une entrée vide', () => ''],
    ['une entrée illisible', () => '{pas du json'],
  ])('%s : aucune requête', async (_name, stdin) => {
    const { run, out, fetchImpl } = setup({ stdin: stdin() });

    expect(await run()).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out).toEqual([]);
  });

  it.each([
    ['un 404', answering(() => new Response('{}', { status: 404 }))],
    ['un 400', answering(() => new Response('{}', { status: 400 }))],
    [
      'une connexion refusée',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    ],
  ])(
    'serveur ancien ou absent (%s) : rien sur la sortie standard, code 0',
    async (_name, fetch) => {
      const { run, out } = setup({ stdin: hookJson(), fetch });

      expect(await run()).toBe(0);
      expect(out).toEqual([]);
    },
  );

  it('un serveur lent : rien sur la sortie standard, en moins de 2 s, code 0', async () => {
    const { run, out } = setup({ stdin: hookJson(), fetch: neverAnswers });
    const started = Date.now();

    expect(await run()).toBe(0);

    expect(Date.now() - started).toBeLessThan(2000);
    expect(out).toEqual([]);
  });

  it('un poste sans connexion : un message fixe sur la sortie d’erreur, rien sur la sortie standard, code 0', async () => {
    const { run, out, err, fetchImpl } = setup({ stdin: hookJson(), env: {} });

    expect(await run()).toBe(0);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out).toEqual([]);
    expect(err).toHaveLength(1);
    expect(err.join('')).not.toContain('où en est');
  });

  it('un accord de Codex seul ne donne pas le rappel à Claude Code', async () => {
    await addUsage(codexHome, 'codex', 'rappel');
    const { run, out, fetchImpl } = setup({ stdin: hookJson(), home: codexHome });

    expect(await run()).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out).toEqual([]);
  });
});
