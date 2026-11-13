import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_PATHS,
  BRIEFING_PROJECT_PARAM,
  type BriefingResponse,
  CommandeSchema,
  type ContextRequest,
} from '../capture/api-contract';
import {
  BRIEFING_STDIN_TIMEOUT_MS,
  BriefingRouteMissingError,
  briefingDirectory,
  fetchBriefingText,
  fetchStartText,
  leonCommand,
  runBriefing,
} from './briefing';
import { writeConnection } from './connection';
import { addUsage, CONSENT_WITHDRAWN_MESSAGE, writeConsent } from './consent';
import { launcherPath } from './hook-commands';
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

  // Un serveur plus ancien que `usages` et `commande` (C3 est strict) répond 400 : le point du matin seul, comme un 404.
  it('retombe sur le point du matin seul sur un 400 (serveur plus ancien que les usages du bloc)', async () => {
    const fetchImpl = vi.fn(async (url: URL) =>
      url.pathname === API_PATHS.contexte
        ? new Response('{}', { status: 400 })
        : Response.json(briefing),
    );

    expect(
      await fetchStartText(asFetch(fetchImpl), env, {
        ...request,
        usages: ['lecture'],
        commande: '~/.leon/bin/leon',
      }),
    ).toBe(briefing.markdown);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url] = fetchImpl.mock.calls[1] as unknown as [URL];
    expect(url.pathname).toBe(API_PATHS.briefing);
  });

  it.each([
    ['un 401', new Response('{}', { status: 401 })],
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
    depot?: string;
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
        ...(input.depot ? { depot: input.depot } : {}),
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

  // T46 : avec l'usage `lecture` de l'outil du crochet, et de lui seul, ses usages et la commande posée partent dans
  // C3 ; sans lui, le corps de toujours (le texte de l'accord de base ne dit que le projet, la branche et la session).
  describe('l’usage `lecture` (le sommaire des fils)', () => {
    let lecteurs: string;
    beforeAll(async () => {
      lecteurs = await mkdtemp(join(tmpdir(), 'leon-lecture-'));
    });
    afterAll(() => rm(lecteurs, { recursive: true, force: true }));
    // Un poste dont les outils ont ces usages, avec ou sans le lanceur ~/.leon/bin/leon.
    async function poste(
      name: string,
      usages: Partial<Record<'claude_code' | 'codex', Array<'lecture' | 'resume' | 'noter'>>>,
      lanceur = true,
    ): Promise<string> {
      const home = join(lecteurs, name);
      for (const [tool, list] of Object.entries(usages)) {
        await writeConsent(home, tool as 'claude_code' | 'codex', 2);
        for (const usage of list) await addUsage(home, tool as 'claude_code' | 'codex', usage);
      }
      if (lanceur) {
        await mkdir(join(home, '.leon', 'bin'), { recursive: true });
        await writeFile(launcherPath(home), '#!/bin/sh\n');
      }
      return home;
    }
    const codexJson = (home: string) =>
      Readable.from([
        JSON.stringify({
          session_id: '01a1b090-6f1c-70c0-bb75-9116938d76c4',
          transcript_path: join(home, '.codex', 'sessions', '2026', '11', '06', 'rollout.jsonl'),
          cwd: '/projets/leon',
          hook_event_name: 'SessionStart',
          source: 'startup',
        }),
      ]);
    const git = { remotes: { '/projets/leon': 'git@github.com:DavSperling/Leon.git' } };

    it('Claude Code : ses usages et le lanceur, avec le tilde', async () => {
      const home = await poste('claude', { claude_code: ['lecture', 'resume'], codex: [] });
      const { run, asked } = setup({
        stdin: Readable.from([hookJson('/projets/leon')]),
        home,
        ...git,
      });

      expect(await run()).toBe(0);

      expect(asked()).toEqual({
        projet: PROJECT,
        branche: null,
        session: SESSION,
        usages: ['lecture', 'resume'],
        commande: '~/.leon/bin/leon',
      });
    });

    it('`crochet codex demarrage` : les usages de Codex, jamais ceux de Claude Code, et inversement', async () => {
      const home = await poste('codex', { claude_code: ['resume'], codex: ['lecture'] });
      const codexRun = setup({ stdin: codexJson(home), home, outil: 'codex', ...git });
      const claudeRun = setup({ stdin: Readable.from([hookJson('/projets/leon')]), home, ...git });

      expect(await codexRun.run()).toBe(0);
      expect(await claudeRun.run()).toBe(0);

      expect(codexRun.asked()).toMatchObject({ usages: ['lecture'], commande: '~/.leon/bin/leon' });
      expect(claudeRun.asked()).toEqual({ projet: PROJECT, branche: null, session: SESSION });
    });

    it('sans `lecture` : ni usages ni commande', async () => {
      const home = await poste('resume', { codex: ['resume'] });
      const { run, asked } = setup({ stdin: codexJson(home), home, outil: 'codex', ...git });

      expect(await run()).toBe(0);

      expect(asked()).toEqual({
        projet: PROJECT,
        branche: null,
        session: '01a1b090-6f1c-70c0-bb75-9116938d76c4',
      });
    });

    // T57 (amendée le 11/11) : `outil` ne part qu'avec l'usage `noter` de l'outil du crochet, et avec lui ses usages et
    // la commande, que cite la phrase de `leon note`, même sans `lecture`.
    it('avec `noter` : l’outil du crochet, ses usages et la commande, même sans `lecture`', async () => {
      const home = await poste('noter', { claude_code: ['noter'], codex: ['lecture', 'noter'] });
      const claudeRun = setup({ stdin: Readable.from([hookJson('/projets/leon')]), home, ...git });
      const codexRun = setup({ stdin: codexJson(home), home, outil: 'codex', ...git });

      expect(await claudeRun.run()).toBe(0);
      expect(await codexRun.run()).toBe(0);

      expect(claudeRun.asked()).toEqual({
        projet: PROJECT,
        branche: null,
        session: SESSION,
        usages: ['noter'],
        commande: '~/.leon/bin/leon',
        outil: 'claude_code',
      });
      expect(codexRun.asked()).toMatchObject({
        usages: ['lecture', 'noter'],
        commande: '~/.leon/bin/leon',
        outil: 'codex',
      });
    });

    it('avec `lecture` sans `noter` : pas d’outil', async () => {
      const home = await poste('lecture-seule', { codex: ['lecture'] });
      const { run, asked } = setup({ stdin: codexJson(home), home, outil: 'codex', ...git });

      expect(await run()).toBe(0);

      expect(asked()).not.toHaveProperty('outil');
      expect(asked()).toMatchObject({ usages: ['lecture'] });
    });

    it('avec `noter`, un serveur plus ancien que `outil` (400) : le point du matin seul, comme aujourd’hui', async () => {
      const home = await poste('noter-ancien', { claude_code: ['noter'] });
      const fetchImpl = vi.fn(async (url: URL) =>
        url.pathname === API_PATHS.contexte
          ? new Response('{}', { status: 400 })
          : Response.json(briefing),
      );
      const { run, out, err } = setup({
        stdin: Readable.from([hookJson('/projets/leon')]),
        home,
        fetch: fetchImpl,
        ...git,
      });

      expect(await run()).toBe(0);

      expect(out).toEqual([briefing.markdown]);
      expect(err).toEqual([]);
    });

    it('sans lanceur, depuis un clone : pnpm dans le clone, avec le tilde sous le dossier personnel', async () => {
      const home = await poste('clone', { claude_code: ['lecture'] }, false);
      const { run, asked } = setup({
        stdin: Readable.from([hookJson('/projets/leon')]),
        home,
        depot: join(home, 'code', 'leon'),
        ...git,
      });

      expect(await run()).toBe(0);

      expect(asked().commande).toBe('pnpm --dir ~/code/leon leon');
    });
  });

  // La commande que cite la consigne (C3 `commande`, D24).
  describe('leonCommand', () => {
    let home: string;
    beforeAll(async () => {
      home = await mkdtemp(join(tmpdir(), 'leon-commande-'));
    });
    afterAll(() => rm(home, { recursive: true, force: true }));

    it('sans lanceur : pnpm dans le clone, `leon` hors d’un clone ou hors de la borne de C3', async () => {
      expect(await leonCommand(home, '/opt/leon')).toBe('pnpm --dir /opt/leon leon');
      expect(await leonCommand(home, `${home}/leon`)).toBe('pnpm --dir ~/leon leon');
      expect(await leonCommand(home, undefined)).toBe('leon');
      expect(await leonCommand(home, "/opt/l'eon")).toBe('leon');
      expect(await leonCommand(home, `/opt/${'a'.repeat(200)}`)).toBe('leon');
    });

    it('un chemin à espaces passe entre apostrophes, et le shell le lit en un seul argument, tilde développé', async () => {
      const inHome = await leonCommand(home, `${home}/code/Leon Project`);
      const outside = await leonCommand(home, '/opt/Leon Project');
      expect(inHome).toBe("pnpm --dir ~/'code/Leon Project' leon");
      expect(outside).toBe("pnpm --dir '/opt/Leon Project' leon");
      // Le shell reçoit les mots de la commande : chacun sur sa ligne.
      const words = (command: string) =>
        execFileSync('sh', ['-c', `printf '%s\\n' ${command}`], {
          env: { ...process.env, HOME: home },
          encoding: 'utf8',
        });
      expect(words(inHome)).toBe(`pnpm\n--dir\n${home}/code/Leon Project\nleon\n`);
      expect(words(outside)).toBe('pnpm\n--dir\n/opt/Leon Project\nleon\n');
      expect(CommandeSchema.safeParse(inHome).success).toBe(true);
    });

    it('avec le lanceur : lui, même depuis un clone', async () => {
      await mkdir(join(home, '.leon', 'bin'), { recursive: true });
      await writeFile(launcherPath(home), '#!/bin/sh\n');

      expect(await leonCommand(home, '/opt/leon')).toBe('~/.leon/bin/leon');
    });
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

  // T49 : le rappel à chaque message de Cursor, de Codex et d'Antigravity, par `leon crochet <outil> prompt`, avec l'usage `rappel`.
  describe('le rappel à chaque message (Cursor, Codex, Antigravity)', () => {
    const REMINDER = '<rappel-leon>Le fil amos/etude (id 3f2a) touche à ce message.</rappel-leon>';
    // Le serveur : le bloc sur `/contexte`, la ligne de rappel (ou ce que `reminder` fait de la requête) sur `/rappel`.
    const server = (reminder: (url: URL, init: RequestInit) => Response | Promise<Response>) =>
      vi.fn(async (url: URL, init: RequestInit) =>
        url.pathname === API_PATHS.rappel
          ? reminder(url, init)
          : url.pathname === API_PATHS.contexte
            ? Response.json({ texte: BLOCK })
            : new Response('{}', { status: 404 }),
      );
    const answers = () => server(() => Response.json({ texte: REMINDER }));
    const neverAnswers = (_url: URL, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    // Les requêtes de rappel, dans l'ordre : leur corps.
    const reminders = (fetchImpl: ReturnType<typeof vi.fn>) =>
      (fetchImpl.mock.calls as unknown as [URL, RequestInit][])
        .filter(([url]) => url.pathname === API_PATHS.rappel)
        .map(([, init]) => JSON.parse(String(init.body)) as Record<string, unknown>);
    const blockRequests = (fetchImpl: ReturnType<typeof vi.fn>) =>
      (fetchImpl.mock.calls as unknown as [URL][]).filter(
        ([url]) => url.pathname === API_PATHS.contexte,
      );

    describe('Cursor', () => {
      const promptJson = (conversation: string, prompt = 'où en est la branche etude ?') =>
        Readable.from([
          JSON.stringify({
            conversation_id: conversation,
            hook_event_name: 'beforeSubmitPrompt',
            prompt,
            workspace_roots: ['/projets/leon'],
            cursor_version: '3.29.9',
          }),
        ]);
      const remotes = { '/projets/leon': 'git@github.com:Acme/Leon.git' };
      let withRappel: string;
      let withoutRappel: string;
      beforeEach(async () => {
        withRappel = await mkdtemp(join(homes, 'cursor-rappel-'));
        await writeConsent(withRappel, 'cursor', 2);
        await addUsage(withRappel, 'cursor', 'rappel');
        withoutRappel = await mkdtemp(join(homes, 'cursor-sans-'));
        await writeConsent(withoutRappel, 'cursor', 2);
        await addUsage(withoutRappel, 'cursor', 'lecture');
      });
      const cursor = (input: {
        conversation: string;
        home: string;
        fetch: ReturnType<typeof vi.fn>;
        prompt?: string;
      }) =>
        setup({
          stdin: promptJson(input.conversation, input.prompt),
          home: input.home,
          outil: 'cursor',
          evenement: 'prompt',
          remotes,
          fetch: input.fetch,
        });

      it('un message suivant, avec rappel : la ligne dans additional_context, le message de l’entrée envoyé', async () => {
        const fetchImpl = answers();
        await cursor({ conversation: 'c-1', home: withRappel, fetch: fetchImpl }).run();

        const next = cursor({ conversation: 'c-1', home: withRappel, fetch: fetchImpl });
        expect(await next.run()).toBe(0);

        expect(next.out.map((line) => JSON.parse(line))).toEqual([
          { continue: true, additional_context: REMINDER },
        ]);
        expect(blockRequests(fetchImpl)).toHaveLength(1); // le bloc n'est venu qu'une fois
        expect(reminders(fetchImpl).at(-1)).toMatchObject({
          projet: 'github.com/acme/leon',
          session: 'c-1',
          message: 'où en est la branche etude ?',
          outil: 'cursor',
          usages: ['rappel'],
        });
      });

      it('le premier message : le bloc et le rappel demandés ensemble, rendus en une seule sortie', async () => {
        const fetchImpl = answers();
        const first = cursor({ conversation: 'c-2', home: withRappel, fetch: fetchImpl });

        expect(await first.run()).toBe(0);

        expect(first.out).toHaveLength(1);
        expect(JSON.parse(first.out[0] ?? '{}')).toEqual({
          continue: true,
          additional_context: `${BLOCK}\n${REMINDER}`,
        });
        expect(blockRequests(fetchImpl)).toHaveLength(1);
        expect(reminders(fetchImpl)).toHaveLength(1);
        // Le bloc est parti avant le rappel, et le témoin est écrit : le message suivant ne le redemande pas.
        const second = cursor({ conversation: 'c-2', home: withRappel, fetch: fetchImpl });
        await second.run();
        expect(blockRequests(fetchImpl)).toHaveLength(1);
      });

      it('sans l’usage rappel : rien ne change, aucune requête après le premier message', async () => {
        const fetchImpl = answers();
        const first = cursor({ conversation: 'c-3', home: withoutRappel, fetch: fetchImpl });
        await first.run();
        expect(JSON.parse(first.out[0] ?? '{}')).toEqual({
          continue: true,
          additional_context: BLOCK,
        });

        const calls = fetchImpl.mock.calls.length;
        const next = cursor({ conversation: 'c-3', home: withoutRappel, fetch: fetchImpl });
        await next.run();

        expect(next.out).toEqual(['{"continue":true}']);
        expect(fetchImpl.mock.calls).toHaveLength(calls);
        expect(reminders(fetchImpl)).toEqual([]);
      });

      it('un serveur de rappel lent, ou ancien : le message passe, le bloc du premier message arrive quand même', async () => {
        const slow = server(neverAnswers);
        const first = cursor({ conversation: 'c-4', home: withRappel, fetch: slow });
        const started = Date.now();
        await first.run();
        expect(Date.now() - started).toBeLessThan(3000);
        expect(JSON.parse(first.out[0] ?? '{}')).toEqual({
          continue: true,
          additional_context: BLOCK,
        });

        const next = cursor({ conversation: 'c-4', home: withRappel, fetch: slow });
        const nextStarted = Date.now();
        expect(await next.run()).toBe(0);
        expect(Date.now() - nextStarted).toBeLessThan(2000);
        expect(next.out).toEqual(['{"continue":true}']);

        const old = server(() => new Response('{}', { status: 404 }));
        const oldNext = cursor({ conversation: 'c-4', home: withRappel, fetch: old });
        await oldNext.run();
        expect(oldNext.out).toEqual(['{"continue":true}']);
      });

      it('le bloc en panne mais le rappel qui répond : la ligne passe, et le bloc sera redemandé', async () => {
        const fetchImpl = vi.fn(async (url: URL) =>
          url.pathname === API_PATHS.rappel
            ? Response.json({ texte: REMINDER })
            : new Response('{}', { status: 500 }),
        );
        const first = cursor({ conversation: 'c-5', home: withRappel, fetch: fetchImpl });

        await first.run();

        expect(JSON.parse(first.out[0] ?? '{}')).toEqual({
          continue: true,
          additional_context: REMINDER,
        });
        const retry = cursor({ conversation: 'c-5', home: withRappel, fetch: answers() });
        await retry.run();
        expect(JSON.parse(retry.out[0] ?? '{}')).toHaveProperty(
          'additional_context',
          `${BLOCK}\n${REMINDER}`,
        );
      });

      it('rien dans la ligne du serveur ni message : {"continue":true}, et un message vide ne part pas', async () => {
        const fetchImpl = server(() => Response.json({ texte: '' }));
        await cursor({ conversation: 'c-6', home: withRappel, fetch: fetchImpl }).run();

        const empty = cursor({ conversation: 'c-6', home: withRappel, fetch: fetchImpl });
        await empty.run();
        expect(empty.out).toEqual(['{"continue":true}']);

        const before = reminders(fetchImpl).length;
        const noMessage = cursor({
          conversation: 'c-6',
          home: withRappel,
          fetch: fetchImpl,
          prompt: '',
        });
        await noMessage.run();
        expect(noMessage.out).toEqual(['{"continue":true}']);
        expect(reminders(fetchImpl)).toHaveLength(before);
      });
    });

    describe('Codex', () => {
      const promptJson = (prompt = 'où en est la branche etude ?') =>
        Readable.from([
          JSON.stringify({
            session_id: 'codex-1',
            hook_event_name: 'UserPromptSubmit',
            cwd: '/projets/leon',
            prompt,
          }),
        ]);
      let withRappel: string;
      beforeEach(async () => {
        withRappel = await mkdtemp(join(homes, 'codex-rappel-'));
        await writeConsent(withRappel, 'codex', 2);
        await addUsage(withRappel, 'codex', 'rappel');
      });
      const codexPrompt = (input: {
        home: string;
        fetch: ReturnType<typeof vi.fn>;
        prompt?: string;
        scheduleUpdate?: () => Promise<unknown>;
        scheduleCatchUp?: () => Promise<unknown>;
      }) =>
        setup({
          stdin: promptJson(input.prompt),
          home: input.home,
          outil: 'codex',
          evenement: 'prompt',
          remotes: { '/projets/leon': 'git@github.com:Acme/Leon.git' },
          fetch: input.fetch,
          ...(input.scheduleUpdate ? { scheduleUpdate: input.scheduleUpdate } : {}),
          ...(input.scheduleCatchUp ? { scheduleCatchUp: input.scheduleCatchUp } : {}),
        });

      it('avec rappel : la ligne dans la forme de Codex, à chaque message, sans bloc ni rattrapage', async () => {
        const fetchImpl = answers();
        const scheduleUpdate = vi.fn(async () => undefined);
        const scheduleCatchUp = vi.fn(async () => undefined);

        const harness = codexPrompt({
          home: withRappel,
          fetch: fetchImpl,
          scheduleUpdate,
          scheduleCatchUp,
        });
        expect(await harness.run()).toBe(0);
        await codexPrompt({ home: withRappel, fetch: fetchImpl }).run();

        expect(harness.out.map((line) => JSON.parse(line))).toEqual([
          {
            hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: REMINDER },
          },
        ]);
        expect(blockRequests(fetchImpl)).toEqual([]);
        expect(reminders(fetchImpl)).toHaveLength(2);
        expect(reminders(fetchImpl)[0]).toMatchObject({
          projet: 'github.com/acme/leon',
          session: 'codex-1',
          message: 'où en est la branche etude ?',
          outil: 'codex',
          usages: ['rappel'],
        });
        expect(scheduleUpdate).not.toHaveBeenCalled();
        expect(scheduleCatchUp).not.toHaveBeenCalled();
      });

      it('sans l’usage rappel, ou sans accord : rien sur la sortie, aucune requête', async () => {
        for (const home of [codex, notAgreed]) {
          const fetchImpl = answers();
          const harness = codexPrompt({ home, fetch: fetchImpl });

          expect(await harness.run()).toBe(0);

          expect(harness.out).toEqual([]);
          expect(harness.err).toEqual([]);
          expect(fetchImpl).not.toHaveBeenCalled();
        }
      });

      it.each([
        ['un serveur lent', server(neverAnswers)],
        ['un serveur ancien (404)', server(() => new Response('{}', { status: 404 }))],
        ['un serveur ancien (400)', server(() => new Response('{}', { status: 400 }))],
        ['un texte vide', server(() => Response.json({ texte: '' }))],
      ])('%s : rien sur la sortie standard, code 0', async (_name, fetchImpl) => {
        const harness = codexPrompt({ home: withRappel, fetch: fetchImpl });
        const started = Date.now();

        expect(await harness.run()).toBe(0);

        expect(Date.now() - started).toBeLessThan(2000);
        expect(harness.out).toEqual([]);
      });

      it('un message vide ne part pas', async () => {
        const fetchImpl = answers();
        const harness = codexPrompt({ home: withRappel, fetch: fetchImpl, prompt: '' });
        await harness.run();
        expect(harness.out).toEqual([]);
        expect(fetchImpl).not.toHaveBeenCalled();
      });
    });

    it('Cursor sans dossier de travail : aucune requête de rappel, le bloc ne change pas', async () => {
      const home = await mkdtemp(join(homes, 'cursor-sans-dossier-'));
      await writeConsent(home, 'cursor', 2);
      await addUsage(home, 'cursor', 'rappel');
      const fetchImpl = answers();
      const noWorkspace = () =>
        setup({
          stdin: Readable.from([
            JSON.stringify({
              conversation_id: 'c-7',
              hook_event_name: 'beforeSubmitPrompt',
              prompt: 'où en est la branche etude ?',
              workspace_roots: [],
              cursor_version: '3.29.9',
            }),
          ]),
          home,
          outil: 'cursor',
          evenement: 'prompt',
          fetch: fetchImpl,
        });

      const first = noWorkspace();
      await first.run();
      expect(JSON.parse(first.out[0] ?? '{}')).toEqual({
        continue: true,
        additional_context: BLOCK,
      });
      const next = noWorkspace();
      await next.run();
      expect(next.out).toEqual(['{"continue":true}']);

      expect(blockRequests(fetchImpl)).toHaveLength(1);
      expect(reminders(fetchImpl)).toEqual([]);
    });

    // Recalé sur l'essai du 11/11 (appli 2.0.6) : PreInvocation porte `lastUserInput`, et `invocationNum` vaut 0 au premier
    // appel du modèle de chaque message.
    describe('Antigravity', () => {
      const agyJson = (conversation: string, fields: Record<string, unknown> = {}) =>
        Readable.from([
          JSON.stringify({
            artifactDirectoryPath: `/Users/demo/.gemini/antigravity/brain/${conversation}`,
            conversationId: conversation,
            initialNumSteps: 1,
            invocationNum: 0,
            lastUserInput: 'où en est la branche etude ?',
            modelName: 'demo',
            transcriptPath: `/Users/demo/.gemini/antigravity/brain/${conversation}/.system_generated/logs/transcript_full.jsonl`,
            workspacePaths: ['/projets/leon'],
            ...fields,
          }),
        ]);
      let withRappel: string;
      let withoutRappel: string;
      beforeEach(async () => {
        withRappel = await mkdtemp(join(homes, 'agy-rappel-'));
        await writeConsent(withRappel, 'antigravity', 2);
        await addUsage(withRappel, 'antigravity', 'rappel');
        withoutRappel = await mkdtemp(join(homes, 'agy-sans-'));
        await writeConsent(withoutRappel, 'antigravity', 2);
        await addUsage(withoutRappel, 'antigravity', 'lecture');
      });
      const agy = (input: {
        conversation: string;
        home: string;
        fetch: ReturnType<typeof vi.fn>;
        fields?: Record<string, unknown>;
      }) =>
        setup({
          stdin: agyJson(input.conversation, input.fields),
          home: input.home,
          outil: 'antigravity',
          evenement: 'prompt',
          remotes: { '/projets/leon': 'git@github.com:Acme/Leon.git' },
          fetch: input.fetch,
        });
      const injected = (out: string[]) => out.map((line) => JSON.parse(line));

      it('le premier message : le bloc et le rappel ensemble ; le suivant, à invocationNum 0 : la ligne dans ephemeralMessage', async () => {
        const fetchImpl = answers();
        const first = agy({ conversation: 'agy-2', home: withRappel, fetch: fetchImpl });
        expect(await first.run()).toBe(0);
        expect(injected(first.out)).toEqual([
          { injectSteps: [{ ephemeralMessage: `${BLOCK}\n${REMINDER}` }] },
        ]);

        const next = agy({
          conversation: 'agy-2',
          home: withRappel,
          fetch: fetchImpl,
          fields: { lastUserInput: 'et la PR 167 ?' },
        });
        expect(await next.run()).toBe(0);
        expect(injected(next.out)).toEqual([{ injectSteps: [{ ephemeralMessage: REMINDER }] }]);

        expect(blockRequests(fetchImpl)).toHaveLength(1);
        expect(reminders(fetchImpl)).toHaveLength(2);
        expect(reminders(fetchImpl).at(-1)).toMatchObject({
          projet: 'github.com/acme/leon',
          session: 'agy-2',
          message: 'et la PR 167 ?',
          outil: 'antigravity',
          usages: ['rappel'],
        });
      });

      it('à invocationNum 1, ou sans lastUserInput : aucune requête de rappel, et la sortie d’avant', async () => {
        const fetchImpl = answers();
        // Une version sans `lastUserInput` (comme la 2.0.1) : le bloc seul au premier message.
        const old = agy({
          conversation: 'agy-3',
          home: withRappel,
          fetch: fetchImpl,
          fields: { lastUserInput: undefined },
        });
        await old.run();
        expect(injected(old.out)).toEqual([{ injectSteps: [{ ephemeralMessage: BLOCK }] }]);

        for (const fields of [
          { invocationNum: 1 },
          { lastUserInput: undefined },
          { lastUserInput: '' },
        ]) {
          const next = agy({ conversation: 'agy-3', home: withRappel, fetch: fetchImpl, fields });
          await next.run();
          expect(next.out).toEqual(['{}']);
        }

        expect(blockRequests(fetchImpl)).toHaveLength(1);
        expect(reminders(fetchImpl)).toEqual([]);
      });

      it('sans l’usage rappel : rien ne change, aucune requête après le premier message', async () => {
        const fetchImpl = answers();
        const first = agy({ conversation: 'agy-4', home: withoutRappel, fetch: fetchImpl });
        await first.run();
        expect(injected(first.out)).toEqual([{ injectSteps: [{ ephemeralMessage: BLOCK }] }]);

        const calls = fetchImpl.mock.calls.length;
        const next = agy({ conversation: 'agy-4', home: withoutRappel, fetch: fetchImpl });
        await next.run();

        expect(next.out).toEqual(['{}']);
        expect(fetchImpl.mock.calls).toHaveLength(calls);
        expect(reminders(fetchImpl)).toEqual([]);
      });

      it('sans dossier de travail : aucune requête de rappel, le bloc ne change pas', async () => {
        const fetchImpl = answers();
        for (let call = 0; call < 2; call++) {
          const harness = agy({
            conversation: 'agy-5',
            home: withRappel,
            fetch: fetchImpl,
            fields: { workspacePaths: [] },
          });
          await harness.run();
          expect(injected(harness.out)).toEqual([
            call === 0 ? { injectSteps: [{ ephemeralMessage: BLOCK }] } : {},
          ]);
        }

        expect(blockRequests(fetchImpl)).toHaveLength(1);
        expect(reminders(fetchImpl)).toEqual([]);
      });

      it('un serveur de rappel lent, ou ancien : le message passe', async () => {
        const slow = server(neverAnswers);
        const first = agy({ conversation: 'agy-6', home: withRappel, fetch: slow });
        const started = Date.now();
        await first.run();
        expect(Date.now() - started).toBeLessThan(3000);
        expect(injected(first.out)).toEqual([{ injectSteps: [{ ephemeralMessage: BLOCK }] }]);

        const next = agy({ conversation: 'agy-6', home: withRappel, fetch: slow });
        const nextStarted = Date.now();
        expect(await next.run()).toBe(0);
        expect(Date.now() - nextStarted).toBeLessThan(2000);
        expect(next.out).toEqual(['{}']);

        const old = server(() => new Response('{}', { status: 404 }));
        const oldNext = agy({ conversation: 'agy-6', home: withRappel, fetch: old });
        await oldNext.run();
        expect(oldNext.out).toEqual(['{}']);
      });
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
