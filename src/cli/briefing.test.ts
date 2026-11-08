import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_PATHS,
  BRIEFING_PROJECT_PARAM,
  type BriefingResponse,
  type ContextRequest,
} from '../capture/api-contract';
import {
  BRIEFING_STDIN_TIMEOUT_MS,
  BriefingRouteMissingError,
  briefingDirectory,
  fetchBriefingText,
  fetchStartText,
  runBriefing,
} from './briefing';
import { writeConnection } from './connection';
import { CONSENT_WITHDRAWN_MESSAGE, writeConsent } from './consent';
import type { GitRunner } from './project-key';

const env = { url: 'http://localhost:3000', token: `leon_${'a'.repeat(43)}` };
const PROJECT = 'github.com/davsperling/leon';
const SESSION = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const briefing: BriefingResponse = {
  markdown: '# Point du matin · leon\n- La PR 22 est fusionnée.',
  projet: PROJECT,
  preparedAt: '2026-10-19T06:30:00.000Z',
};
const BLOCK = [
  '<contexte-leon>',
  '## Mes dernières sessions sur github.com/davsperling/leon',
  '- 01/11 18:02 · Claude Code · branche main',
  '</contexte-leon>',
  '<point-du-matin>',
  '# Point du matin · leon',
  '</point-du-matin>',
].join('\n');
const request: ContextRequest = { projet: PROJECT, branche: 'amos/etude', session: SESSION };

const fetchReturning = (response: Response) => vi.fn(async () => response);
const asFetch = (fn: unknown) => fn as typeof fetch;
const folderKey = (path: string) =>
  `dossier:${createHash('sha256').update(path).digest('hex').slice(0, 16)}`;
// Un serveur plus ancien que la route du bloc : 404 sur `/contexte`, le point du matin sur `/briefing`.
const olderServer = () =>
  vi.fn(async (url: URL) =>
    url.pathname === API_PATHS.contexte
      ? new Response('{}', { status: 404 })
      : Response.json(briefing),
  );

afterEach(() => vi.restoreAllMocks());

describe('fetchBriefingText', () => {
  it('demande le point du projet et renvoie le markdown d’une réponse conforme, en présentant le jeton', async () => {
    const fetchImpl = fetchReturning(Response.json(briefing));

    const text = await fetchBriefingText(asFetch(fetchImpl), env, PROJECT);

    expect(text).toBe(briefing.markdown);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.origin + url.pathname).toBe(new URL(API_PATHS.briefing, env.url).href);
    expect(url.searchParams.get(BRIEFING_PROJECT_PARAM)).toBe(PROJECT);
    expect([...url.searchParams.keys()]).toEqual([BRIEFING_PROJECT_PARAM]);
    expect(init.headers).toEqual({ Authorization: `Bearer ${env.token}` });
  });

  it.each([
    ['un 401', new Response('{}', { status: 401 })],
    ['un 400', new Response('{}', { status: 400 })],
    ['un 500', new Response('{}', { status: 500 })],
    ['un corps non conforme', Response.json({ markdown: 3 })],
    ['un corps non JSON', new Response('<html>', { status: 200 })],
  ])('renvoie null sur %s', async (_name, response) => {
    expect(await fetchBriefingText(asFetch(fetchReturning(response)), env, PROJECT)).toBeNull();
  });

  // Un 404 n'est ni un jeton refusé ni un serveur injoignable : la route n'existe pas sur ce serveur.
  // L'erreur remonte pour que la commande le dise (elle sort quand même avec le code 0).
  it('signale une route absente sur un 404, au lieu de dire « serveur injoignable »', async () => {
    const fetchImpl = fetchReturning(new Response('{}', { status: 404 }));

    await expect(fetchBriefingText(asFetch(fetchImpl), env, PROJECT)).rejects.toThrow(
      BriefingRouteMissingError,
    );
    await expect(fetchBriefingText(asFetch(fetchImpl), env, PROJECT)).rejects.toThrow(
      /does not prepare a morning briefing yet/,
    );
  });

  it('renvoie null sur une erreur réseau', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });

    expect(await fetchBriefingText(asFetch(fetchImpl), env, PROJECT)).toBeNull();
  });

  it('renvoie null quand le délai de 3 secondes est dépassé', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.timeout(20));
    const neverAnswers = (_url: URL, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });

    expect(await fetchBriefingText(asFetch(neverAnswers), env, PROJECT)).toBeNull();
    expect(timeout).toHaveBeenCalledWith(3000);
  });
});

describe('fetchStartText', () => {
  it('demande le bloc en POST, projet, branche et session dans le corps, en présentant le jeton', async () => {
    const fetchImpl = fetchReturning(Response.json({ texte: BLOCK }));

    expect(await fetchStartText(asFetch(fetchImpl), env, request)).toBe(BLOCK);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    // Rien dans l'adresse : la branche n'a rien à faire dans les journaux d'URL.
    expect(url.href).toBe(new URL(API_PATHS.contexte, env.url).href);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: `Bearer ${env.token}`,
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init.body))).toEqual(request);
  });

  it('retombe sur le point du matin seul quand le serveur n’a pas la route du bloc (404)', async () => {
    const fetchImpl = olderServer();

    expect(await fetchStartText(asFetch(fetchImpl), env, request)).toBe(briefing.markdown);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url] = fetchImpl.mock.calls[1] as unknown as [URL];
    expect(url.pathname).toBe(API_PATHS.briefing);
    expect(url.searchParams.get(BRIEFING_PROJECT_PARAM)).toBe(PROJECT);
  });

  it('signale une route absente quand ce serveur n’a ni le bloc ni le point du matin', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 404 }));

    await expect(fetchStartText(asFetch(fetchImpl), env, request)).rejects.toThrow(
      BriefingRouteMissingError,
    );
  });

  it.each([
    ['un 401', new Response('{}', { status: 401 })],
    ['un 400', new Response('{}', { status: 400 })],
    ['un 500', new Response('{}', { status: 500 })],
    ['un corps non conforme', Response.json({ texte: 3 })],
    ['un corps non JSON', new Response('<html>', { status: 200 })],
  ])('renvoie null sur %s, sans repli', async (_name, response) => {
    const fetchImpl = fetchReturning(response);

    expect(await fetchStartText(asFetch(fetchImpl), env, request)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('renvoie null sur une erreur réseau', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });

    expect(await fetchStartText(asFetch(fetchImpl), env, request)).toBeNull();
  });

  it('un seul délai de 3 secondes couvre le bloc et le repli sur le point du matin', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetchImpl = olderServer();

    await fetchStartText(asFetch(fetchImpl), env, request);

    expect(timeout).toHaveBeenCalledTimes(1);
    expect(timeout).toHaveBeenCalledWith(3000);
    const [first, second] = fetchImpl.mock.calls.map(
      (call) => (call as unknown as [URL, RequestInit])[1].signal,
    );
    expect(first).toBeInstanceOf(AbortSignal);
    expect(second).toBe(first);
  });
});

// Le crochet lance `pnpm -s --dir <dépôt de Leon> leon briefing` : le dossier du processus est alors le dépôt de
// Leon, jamais le projet de l'utilisateur. Le projet vient du JSON du crochet, sinon de INIT_CWD (posé par pnpm :
// le dossier d'où pnpm a été lancé), sinon du dossier du processus.
describe('briefingDirectory', () => {
  const hook = (cwd: unknown) =>
    JSON.stringify({ session_id: 's1', hook_event_name: 'SessionStart', source: 'startup', cwd });

  it('prend le `cwd` du JSON reçu du crochet', () => {
    expect(briefingDirectory(hook('/projets/client'), { INIT_CWD: '/ailleurs' }, '/leon')).toBe(
      '/projets/client',
    );
  });

  it.each([
    ['une entrée vide', ''],
    ['une entrée illisible', '{pas du json'],
    ['un JSON sans cwd', JSON.stringify({ session_id: 's1' })],
    ['un cwd relatif', hook('projets/client')],
    ['un cwd qui n’est pas une chaîne', hook(42)],
  ])('sinon INIT_CWD, posé par pnpm, pour %s', (_name, stdin) => {
    expect(briefingDirectory(stdin, { INIT_CWD: '/projets/client' }, '/leon')).toBe(
      '/projets/client',
    );
  });

  it('sinon le dossier du processus', () => {
    expect(briefingDirectory('', {}, '/projets/client')).toBe('/projets/client');
    expect(briefingDirectory('', { INIT_CWD: 'relatif' }, '/projets/client')).toBe(
      '/projets/client',
    );
  });
});

describe('runBriefing', () => {
  const serverEnv = { LEON_URL: env.url, LEON_TOKEN: env.token };
  // L'accord local (C7), dans des HOME temporaires : jamais le vrai ~/.leon. `agreed` a l'accord en version 2 ;
  // `notAgreed` n'en a aucun (crochets installés avant ce chantier) ; `withdrawn` l'a retiré (version 0).
  let homes: string;
  let agreed: string;
  let notAgreed: string;
  let withdrawn: string;
  let connected: string; // l'accord en version 2, et une connexion de `leon login`
  let codex: string; // l'accord de Codex en version 2 (T17), et pas celui de Claude Code
  const SAVED = { url: 'https://leon.example', token: `leon_${'s'.repeat(43)}` };
  beforeAll(async () => {
    homes = await mkdtemp(join(tmpdir(), 'leon-point-'));
    agreed = join(homes, 'accord');
    notAgreed = join(homes, 'sans-accord');
    withdrawn = join(homes, 'retire');
    connected = join(homes, 'connecte');
    codex = join(homes, 'codex');
    await writeConsent(codex, 'codex', 2);
    await writeConsent(agreed, 'claude_code', 2);
    await writeConsent(withdrawn, 'claude_code', 0);
    await writeConsent(connected, 'claude_code', 2);
    await writeConnection(connected, {
      url: SAVED.url,
      jeton: SAVED.token,
      ordinateur: 'MacBook-Pro',
      espace: 'Acme',
      cree_le: '2026-11-03T10:00:00.000Z',
    });
  });
  afterAll(() => rm(homes, { recursive: true, force: true }));
  const hookJson = (cwd: string) =>
    JSON.stringify({
      session_id: SESSION,
      hook_event_name: 'SessionStart',
      source: 'startup',
      cwd,
    });

  function setup(input: {
    stdin: Readable;
    env?: Record<string, string | undefined>;
    cwd?: string;
    home?: string;
    remotes?: Record<string, string>;
    branches?: Record<string, string>;
    git?: GitRunner;
    fetch?: ReturnType<typeof vi.fn>;
    scheduleUpdate?: () => Promise<unknown>;
    scheduleCatchUp?: () => Promise<unknown>;
    outil?: 'codex' | 'cursor' | 'antigravity';
    evenement?: 'demarrage' | 'prompt';
  }) {
    const out: string[] = [];
    const err: string[] = [];
    const fetchImpl = input.fetch ?? fetchReturning(Response.json({ texte: BLOCK }));
    const git =
      input.git ??
      vi.fn(
        async (args: string[], cwd: string) =>
          (args[0] === 'branch' ? input.branches : input.remotes)?.[cwd] ?? null,
      );
    const run = () =>
      runBriefing({
        stdin: input.stdin,
        env: input.env ?? serverEnv,
        cwd: input.cwd ?? '/leon',
        home: input.home ?? agreed,
        git,
        fetch: asFetch(fetchImpl),
        out: (text) => out.push(text),
        err: (text) => err.push(text),
        ...(input.scheduleUpdate ? { scheduleUpdate: input.scheduleUpdate } : {}),
        ...(input.scheduleCatchUp ? { scheduleCatchUp: input.scheduleCatchUp } : {}),
        ...(input.outil ? { outil: input.outil } : {}),
        ...(input.evenement ? { evenement: input.evenement } : {}),
      });
    // Le corps de la demande du bloc : le projet, la branche et la session.
    const asked = () => {
      const [, init] = (fetchImpl.mock.calls[0] ?? []) as unknown as [URL, RequestInit?];
      return JSON.parse(String(init?.body ?? '{}')) as Partial<ContextRequest>;
    };
    return { run, out, err, git, fetchImpl, asked };
  }

  it('affiche le bloc du projet, de la branche et de la session du JSON du crochet, et sort avec 0', async () => {
    const { run, out, err, git, asked } = setup({
      stdin: Readable.from([hookJson('/projets/leon')]),
      env: { ...serverEnv, INIT_CWD: '/ailleurs' },
      remotes: { '/projets/leon': 'git@github.com:DavSperling/Leon.git' },
      branches: { '/projets/leon': 'amos/etude' },
    });

    expect(await run()).toBe(0);

    expect(git).toHaveBeenCalledWith(['remote', 'get-url', 'origin'], '/projets/leon');
    expect(git).toHaveBeenCalledWith(['branch', '--show-current'], '/projets/leon');
    expect(asked()).toEqual({ projet: PROJECT, branche: 'amos/etude', session: SESSION });
    expect(out).toEqual([BLOCK]);
    expect(err).toEqual([]);
  });

  it('pour Codex (crochet codex demarrage), enveloppe le bloc dans la sortie JSON de C5, même sous ~/.codex', async () => {
    const { run, out, err, asked } = setup({
      stdin: Readable.from([
        JSON.stringify({
          session_id: '01a1b090-6f1c-70c0-bb75-9116938d76c4',
          transcript_path: join(codex, '.codex', 'sessions', '2026', '11', '06', 'rollout.jsonl'),
          cwd: '/projets/leon',
          hook_event_name: 'SessionStart',
          source: 'startup',
        }),
      ]),
      home: codex,
      outil: 'codex',
      remotes: { '/projets/leon': 'git@github.com:DavSperling/Leon.git' },
      branches: { '/projets/leon': 'main' },
    });

    expect(await run()).toBe(0);

    expect(asked()).toEqual({
      projet: PROJECT,
      branche: 'main',
      session: '01a1b090-6f1c-70c0-bb75-9116938d76c4',
    });
    expect(out.map((text) => JSON.parse(text))).toEqual([
      { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: BLOCK } },
    ]);
    expect(err).toEqual([]);
  });

  it('pour Codex, sans son accord à lui, n’envoie rien et n’écrit rien sur la sortie standard', async () => {
    const { run, out, fetchImpl, git } = setup({
      stdin: Readable.from([hookJson('/projets/leon')]),
      home: agreed, // l'accord de Claude Code seul
      outil: 'codex',
    });

    expect(await run()).toBe(0);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(git).not.toHaveBeenCalled();
    expect(out).toEqual([]);
  });

  it('sans JSON du crochet, prend le dossier d’où pnpm a été lancé (INIT_CWD)', async () => {
    const { run, asked } = setup({
      stdin: Readable.from([]),
      env: { ...serverEnv, INIT_CWD: '/projets/sans-depot' },
    });

    expect(await run()).toBe(0);

    expect(asked().projet).toBe(folderKey('/projets/sans-depot'));
  });

  it('sans JSON ni INIT_CWD, prend le dossier du processus', async () => {
    const { run, asked } = setup({ stdin: Readable.from([]), cwd: '/projets/ici' });

    expect(await run()).toBe(0);

    expect(asked().projet).toBe(folderKey('/projets/ici'));
  });

  // Lancée à la main, aucune session ne démarre : il n'y en a aucune à exclure du bloc.
  it('sans JSON du crochet, envoie un identifiant de session neuf, qui n’exclut aucune session', async () => {
    const first = setup({ stdin: Readable.from([]) });
    const second = setup({ stdin: Readable.from([]) });

    await first.run();
    await second.run();

    expect(first.asked().session).toMatch(UUID);
    expect(second.asked().session).toMatch(UUID);
    expect(second.asked().session).not.toBe(first.asked().session);
  });

  it.each([
    ['en tête détachée (git ne rend rien)', undefined],
    ['plus longue que ce que la route accepte', `amos/${'x'.repeat(200)}`],
  ])('envoie une branche nulle %s', async (_name, branch) => {
    const { run, asked } = setup({
      stdin: Readable.from([hookJson('/projets/leon')]),
      branches: branch === undefined ? {} : { '/projets/leon': branch },
    });

    expect(await run()).toBe(0);

    expect(asked().branche).toBeNull();
  });

  // Une CLI mise à jour par `git pull` n'envoie rien de plus que ce que l'utilisateur a accepté : la branche, la
  // session et le bloc de mes sessions attendent l'accord en version 2 (T07).
  it('sans accord, demande le point du matin seul, comme avant, sans lire ni envoyer la branche ou la session', async () => {
    const fetchImpl = fetchReturning(Response.json(briefing));
    const { run, out, err, git } = setup({
      stdin: Readable.from([hookJson('/projets/leon')]),
      home: notAgreed,
      remotes: { '/projets/leon': 'git@github.com:DavSperling/Leon.git' },
      branches: { '/projets/leon': 'amos/etude' },
      fetch: fetchImpl,
    });

    expect(await run()).toBe(0);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe(API_PATHS.briefing);
    expect([...url.searchParams]).toEqual([[BRIEFING_PROJECT_PARAM, PROJECT]]);
    expect(init.method).toBeUndefined();
    expect(init.body).toBeUndefined();
    expect(git).not.toHaveBeenCalledWith(['branch', '--show-current'], expect.anything());
    expect(out).toEqual([briefing.markdown]);
    expect(err).toEqual([]);
  });

  it('avec un serveur plus ancien que la route du bloc, affiche le point du matin seul, comme avant', async () => {
    const { run, out, err } = setup({
      stdin: Readable.from([hookJson('/projets/leon')]),
      fetch: olderServer(),
    });

    expect(await run()).toBe(0);

    expect(out).toEqual([briefing.markdown]);
    expect(err).toEqual([]);
  });

  // Lancée à la main dans un terminal : l'entrée standard est le clavier, qui ne se ferme jamais.
  it('lancée à la main dans un terminal, n’attend pas l’entrée standard', async () => {
    const terminal = Object.assign(new Readable({ read() {} }), { isTTY: true });
    const { run, out, asked } = setup({
      stdin: terminal,
      env: { ...serverEnv, INIT_CWD: '/projets/client' },
    });
    try {
      const started = Date.now();

      expect(await run()).toBe(0);

      expect(Date.now() - started).toBeLessThan(BRIEFING_STDIN_TIMEOUT_MS);
      expect(asked().projet).toBe(folderKey('/projets/client'));
      expect(out).toEqual([BLOCK]);
    } finally {
      terminal.destroy();
    }
  });

  it('une entrée standard qui ne se ferme jamais ne la retient pas plus que le délai de lecture', async () => {
    const neverCloses = new Readable({ read() {} });
    const { run, asked } = setup({
      stdin: neverCloses,
      env: { ...serverEnv, INIT_CWD: '/projets/client' },
    });
    try {
      const started = Date.now();

      expect(await run()).toBe(0);

      expect(Date.now() - started).toBeLessThan(BRIEFING_STDIN_TIMEOUT_MS + 1000);
      expect(asked().projet).toBe(folderKey('/projets/client'));
    } finally {
      neverCloses.destroy();
    }
  });

  // Le pire cas, en vrai temps : git ne rend rien qu'à son délai (3 s, project-key.ts) ; le serveur dit tard qu'il
  // n'a pas la route du bloc, puis le point du matin ne répond jamais. La clé et la branche se lisent ensemble, et
  // un seul délai de 3 s couvre les deux requêtes : 3 s + 3 s. Lues l'une après l'autre, ou avec un délai par
  // requête, on dépasserait 8,9 s.
  it('git lent et serveur lent : une sortie en moins de 7,5 s', async () => {
    const slowGit = vi.fn(() => new Promise<null>((done) => setTimeout(() => done(null), 3000)));
    const slowServer = vi.fn(
      (url: URL, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          if (url.pathname === API_PATHS.contexte) {
            setTimeout(() => resolve(new Response('{}', { status: 404 })), 2900);
          }
        }),
    );
    const { run, out, err } = setup({
      stdin: Readable.from([hookJson('/projets/leon')]),
      git: slowGit,
      fetch: slowServer,
    });
    const started = Date.now();

    expect(await run()).toBe(0);

    expect(Date.now() - started).toBeLessThan(7500);
    expect(slowGit).toHaveBeenCalledTimes(2);
    expect(slowServer).toHaveBeenCalledTimes(2);
    expect(out).toEqual([]);
    expect(err).toHaveLength(1);
    expect(err[0]).toMatch(/^Leon: /);
  }, 15_000);

  it.each([
    ['un serveur injoignable', vi.fn(async () => Promise.reject(new TypeError('fetch failed')))],
    ['une route absente', fetchReturning(new Response('{}', { status: 404 }))],
  ])(
    'sort avec 0 sur %s, avec un message sur la sortie d’erreur seulement',
    async (_name, fetchImpl) => {
      const { run, out, err } = setup({ stdin: Readable.from([]), fetch: fetchImpl });

      expect(await run()).toBe(0);

      expect(out).toEqual([]);
      expect(err).toHaveLength(1);
      expect(err[0]).toMatch(/^Leon: /);
    },
  );

  it('sort avec 0 sans LEON_URL ni LEON_TOKEN, sans rien demander au serveur', async () => {
    const { run, out, err, fetchImpl } = setup({ stdin: Readable.from([]), env: {} });

    expect(await run()).toBe(0);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out).toEqual([]);
    expect(err.join('\n')).toMatch(/LEON_URL/);
    expect(err.join('\n')).toMatch(/run `~\/\.leon\/bin\/leon login`/);
  });

  it('sans LEON_URL ni LEON_TOKEN, prend la connexion de leon login (~/.leon/connexion.json)', async () => {
    const { run, out, err, fetchImpl } = setup({
      stdin: Readable.from([hookJson('/projets/leon')]),
      env: {},
      home: connected,
    });

    expect(await run()).toBe(0);

    const [address, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(address.origin).toBe(SAVED.url);
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${SAVED.token}` });
    expect(out).toEqual([BLOCK]);
    expect(err).toEqual([]);
  });

  it('LEON_URL et LEON_TOKEN, posées toutes les deux, passent avant la connexion enregistrée', async () => {
    const { run, fetchImpl } = setup({
      stdin: Readable.from([hookJson('/projets/leon')]),
      env: serverEnv,
      home: connected,
    });

    expect(await run()).toBe(0);

    const [address, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(address.origin).toBe(env.url);
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${env.token}` });
  });

  it('accord retiré : code 0, le seul message du retrait, sans rien demander ni lancer git', async () => {
    const { run, out, err, git, fetchImpl } = setup({
      stdin: Readable.from([hookJson('/projets/leon')]),
      home: withdrawn,
    });

    expect(await run()).toBe(0);

    expect(out).toEqual([]);
    expect(err).toEqual([CONSENT_WITHDRAWN_MESSAGE]);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(git).not.toHaveBeenCalled();
  });

  // T28 : Cursor reçoit le bloc au premier message d'une conversation (beforeSubmitPrompt), une seule fois.
  describe('Cursor : le bloc au premier message, une fois par conversation', () => {
    const promptJson = (conversation: string) =>
      Readable.from([
        JSON.stringify({
          conversation_id: conversation,
          generation_id: 'g',
          hook_event_name: 'beforeSubmitPrompt',
          prompt: 'Bonjour',
          workspace_roots: ['/projets/leon'],
          cursor_version: '3.27.0',
        }),
      ]);
    let cursorHome: string;
    beforeEach(async () => {
      cursorHome = await mkdtemp(join(homes, 'cursor-'));
      await writeConsent(cursorHome, 'cursor', 2);
    });

    it('au premier message : le bloc dans la forme de Cursor, la conversation exclue ; au second : rien d’autre', async () => {
      const first = setup({
        stdin: promptJson('conv-1'),
        home: cursorHome,
        outil: 'cursor',
        evenement: 'prompt',
        remotes: { '/projets/leon': 'git@github.com:Acme/Leon.git' },
      });
      expect(await first.run()).toBe(0);
      expect(first.out.map((line) => JSON.parse(line))).toEqual([
        { continue: true, additional_context: BLOCK },
      ]);
      expect(first.asked()).toMatchObject({ projet: 'github.com/acme/leon', session: 'conv-1' });

      const second = setup({
        stdin: promptJson('conv-1'),
        home: cursorHome,
        outil: 'cursor',
        evenement: 'prompt',
      });
      expect(await second.run()).toBe(0);
      expect(second.out).toEqual(['{"continue":true}']);
      expect(second.fetchImpl).not.toHaveBeenCalled();

      const other = setup({
        stdin: promptJson('conv-2'),
        home: cursorHome,
        outil: 'cursor',
        evenement: 'prompt',
      });
      await other.run();
      expect(JSON.parse(other.out[0] ?? '{}')).toHaveProperty('additional_context', BLOCK);
    });

    it('sans accord, ou serveur en panne : {"continue":true}, jamais un message bloqué', async () => {
      const without = setup({
        stdin: promptJson('conv-3'),
        home: notAgreed,
        outil: 'cursor',
        evenement: 'prompt',
      });
      await without.run();
      expect(without.out).toEqual(['{"continue":true}']);

      const failing = setup({
        stdin: promptJson('conv-4'),
        home: cursorHome,
        outil: 'cursor',
        evenement: 'prompt',
        fetch: fetchReturning(new Response('{}', { status: 500 })),
      });
      await failing.run();
      expect(failing.out).toEqual(['{"continue":true}']);
      // Rien n'a été donné : le message suivant réessaie.
      const retry = setup({
        stdin: promptJson('conv-4'),
        home: cursorHome,
        outil: 'cursor',
        evenement: 'prompt',
      });
      await retry.run();
      expect(JSON.parse(retry.out[0] ?? '{}')).toHaveProperty('additional_context', BLOCK);
    });

    it('le premier message de Codex ne reçoit rien : son bloc vient au démarrage', async () => {
      const harness = setup({
        stdin: Readable.from([hookJson('/projets/leon')]),
        home: codex,
        outil: 'codex',
        evenement: 'prompt',
      });
      await harness.run();
      expect(harness.out).toEqual([]);
      expect(harness.fetchImpl).not.toHaveBeenCalled();
    });
  });

  // T33, recalé sur l'essai T31 : Antigravity reçoit le bloc par PreInvocation, une seule fois par conversation, alors que
  // le crochet part avant chaque appel au modèle (`invocationNum` repart à 0 à chaque message).
  describe('Antigravity : le bloc au premier PreInvocation, une seule fois', () => {
    const agyJson = (invocationNum: number) =>
      Readable.from([
        JSON.stringify({
          artifactDirectoryPath: '/Users/demo/.gemini/antigravity/brain/agy-1',
          conversationId: 'agy-1',
          initialNumSteps: 1,
          invocationNum,
          transcriptPath:
            '/Users/demo/.gemini/antigravity/brain/agy-1/.system_generated/logs/transcript.jsonl',
          workspacePaths: ['/projets/leon'],
        }),
      ]);

    it('le bloc en ephemeralMessage au premier appel ; aux suivants, même à invocationNum 0 : {} sans rien demander', async () => {
      const agyHome = await mkdtemp(join(homes, 'agy-'));
      await writeConsent(agyHome, 'antigravity', 2);

      const first = setup({
        stdin: agyJson(0),
        home: agyHome,
        outil: 'antigravity',
        evenement: 'prompt',
        remotes: { '/projets/leon': 'git@github.com:Acme/Leon.git' },
      });
      await first.run();
      expect(first.out.map((line) => JSON.parse(line))).toEqual([
        { injectSteps: [{ ephemeralMessage: BLOCK }] },
      ]);
      expect(first.asked()).toMatchObject({ projet: 'github.com/acme/leon', session: 'agy-1' });

      for (const invocationNum of [1, 0]) {
        const next = setup({
          stdin: agyJson(invocationNum),
          home: agyHome,
          outil: 'antigravity',
          evenement: 'prompt',
        });
        await next.run();
        expect(next.out).toEqual(['{}']);
        expect(next.fetchImpl).not.toHaveBeenCalled();
      }
    });
  });

  // Le rattrapage (T19, catch-up.ts) : lancé détaché au démarrage de tout outil, une fois la sortie écrite, avant la mise
  // à jour automatique ; son échec ne change rien au crochet.
  describe('rattrapage', () => {
    const hook = () => Readable.from([hookJson('/projets/leon')]);

    it('est lancé une fois le bloc écrit, avant la mise à jour, et le crochet rend la même sortie', async () => {
      const calls: string[] = [];
      const harness = setup({
        stdin: hook(),
        scheduleCatchUp: async () => {
          calls.push(`rattrapage après ${harness.out.length} sortie`);
        },
        scheduleUpdate: async () => {
          calls.push('mise à jour');
        },
      });

      expect(await harness.run()).toBe(0);

      expect(calls).toEqual(['rattrapage après 1 sortie', 'mise à jour']);
      expect(harness.out).toEqual([BLOCK]);
    });

    it('est lancé aussi au démarrage de Codex ; une erreur ne change ni la sortie ni la mise à jour', async () => {
      const scheduleUpdate = vi.fn(async () => {});
      const { run, out, err } = setup({
        stdin: hook(),
        home: codex,
        outil: 'codex',
        scheduleCatchUp: async () => {
          throw new Error('boom');
        },
        scheduleUpdate,
      });

      expect(await run()).toBe(0);

      expect(out).toHaveLength(1);
      expect(err).toEqual([]);
      expect(scheduleUpdate).toHaveBeenCalledTimes(1);
    });

    it('n’est pas lancé sous un autre outil qui a recopié les crochets de Claude Code', async () => {
      const scheduleCatchUp = vi.fn(async () => {});

      await setup({
        stdin: hook(),
        env: { ...serverEnv, CURSOR_VERSION: '1.7.2' },
        scheduleCatchUp,
      }).run();

      expect(scheduleCatchUp).not.toHaveBeenCalled();
    });
  });

  // La mise à jour automatique (S12, self-update.ts) : `scheduleUpdate` décide (24 h, forme clone) et lance le processus
  // détaché ; le crochet ne fait que l'appeler, une fois sa sortie écrite, et ne dépend jamais de ce qui en sort.
  describe('mise à jour automatique', () => {
    const hook = () => Readable.from([hookJson('/projets/leon')]);

    it('est lancée une fois le bloc écrit, et le crochet rend la même sortie', async () => {
      const calls: string[] = [];
      let seen: string[] = [];
      const harness = setup({
        stdin: hook(),
        scheduleUpdate: async () => {
          calls.push('update');
          seen = [...harness.out];
        },
      });

      expect(await harness.run()).toBe(0);

      expect(calls).toEqual(['update']);
      expect(seen).toEqual([BLOCK]);
      expect(harness.out).toEqual([BLOCK]);
      expect(harness.err).toEqual([]);
    });

    it('est lancée aussi quand le serveur ne répond pas : le message du crochet ne change pas', async () => {
      const scheduleUpdate = vi.fn(async () => {});
      const { run, out, err } = setup({
        stdin: hook(),
        fetch: fetchReturning(new Response('{}', { status: 500 })),
        scheduleUpdate,
      });

      expect(await run()).toBe(0);

      expect(scheduleUpdate).toHaveBeenCalledTimes(1);
      expect(out).toEqual([]);
      expect(err).toEqual(['Leon: briefing unavailable (server unreachable or token refused).']);
    });

    it.each([
      ['une erreur asynchrone', async () => Promise.reject(new Error('boom'))],
      [
        'une erreur synchrone',
        () => {
          throw new Error('boom');
        },
      ],
    ])('%s ne change ni la sortie ni le code', async (_name, scheduleUpdate) => {
      const { run, out, err } = setup({
        stdin: hook(),
        scheduleUpdate: scheduleUpdate as () => Promise<unknown>,
      });

      expect(await run()).toBe(0);

      expect(out).toEqual([BLOCK]);
      expect(err).toEqual([]);
    });

    it.each([
      ['sans connexion', () => ({ env: {} })],
      ['accord retiré', () => ({ home: withdrawn })],
      ['sous Cursor', () => ({ env: { ...serverEnv, CURSOR_VERSION: '1.7.2' } })],
    ])('n’est pas lancée %s', async (_name, over) => {
      const scheduleUpdate = vi.fn(async () => {});

      await setup({ stdin: hook(), scheduleUpdate, ...over() }).run();

      expect(scheduleUpdate).not.toHaveBeenCalled();
    });
  });

  // Les crochets de Claude Code lancés par un autre outil (T06) : Cursor qui les reprend, Codex qui les a recopiés
  // à sa migration. Chaque outil reçoit le bloc par son propre crochet : rien en double, et rien ne part.
  describe('lancée par un autre outil que Claude Code', () => {
    const hookWith = (fields: Record<string, unknown>) =>
      JSON.stringify({ ...JSON.parse(hookJson('/projets/leon')), ...fields });
    // `~` : le HOME de la commande, connu seulement une fois les tests lancés.
    const transcriptAt = (path: string) => (home: string) =>
      hookWith({ transcript_path: path.replace(/^~/, home) });

    it.each([
      ['une entrée Cursor (cursor_version)', () => hookWith({ cursor_version: '1.7.2' }), {}],
      ['CURSOR_VERSION posé', () => hookJson('/projets/leon'), { CURSOR_VERSION: '1.7.2' }],
      [
        'une session Codex sous CODEX_HOME',
        transcriptAt('/codex/sessions/2026/11/02/rollout-1.jsonl'),
        { CODEX_HOME: '/codex' },
      ],
      [
        'une session Codex sous ~/.codex, sans CODEX_HOME',
        transcriptAt('~/.codex/sessions/2026/11/02/rollout-1.jsonl'),
        {},
      ],
    ])('%s : code 0, sans rien écrire ni rien demander', async (_name, stdin, extraEnv) => {
      const { run, out, err, git, fetchImpl } = setup({
        stdin: Readable.from([stdin(agreed)]),
        env: { ...serverEnv, ...extraEnv },
      });

      expect(await run()).toBe(0);

      expect(out).toEqual([]);
      expect(err).toEqual([]);
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(git).not.toHaveBeenCalled();
    });

    it('sous Cursor, n’écrit rien même avec l’accord retiré', async () => {
      const { run, out, err, fetchImpl } = setup({
        stdin: Readable.from([hookJson('/projets/leon')]),
        env: { ...serverEnv, CURSOR_VERSION: '1.7.2' },
        home: withdrawn,
      });

      expect(await run()).toBe(0);

      expect(out).toEqual([]);
      expect(err).toEqual([]);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('sous Cursor, n’écrit rien même sans LEON_URL', async () => {
      const { run, out, err } = setup({
        stdin: Readable.from([hookJson('/projets/leon')]),
        env: { CURSOR_VERSION: '1.7.2' },
      });

      expect(await run()).toBe(0);

      expect(out).toEqual([]);
      expect(err).toEqual([]);
    });

    it.each([
      ['une session Claude Code', '~/.claude/projects/-p/s.jsonl', {}],
      ['un dossier voisin de sessions/', '~/.codex/sessions-copie/s.jsonl', {}],
      [
        'une session sous ~/.codex quand CODEX_HOME est ailleurs',
        '~/.codex/sessions/s.jsonl',
        { CODEX_HOME: '/codex' },
      ],
      ['un chemin relatif', '.codex/sessions/s.jsonl', { CODEX_HOME: '.codex' }],
    ])('%s : le bloc, comme d’habitude', async (_name, transcriptPath, extraEnv) => {
      const { run, out } = setup({
        stdin: Readable.from([transcriptAt(transcriptPath)(agreed)]),
        env: { ...serverEnv, CURSOR_VERSION: '', ...extraEnv },
      });

      expect(await run()).toBe(0);

      expect(out).toEqual([BLOCK]);
    });
  });
});
