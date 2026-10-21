import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS, BRIEFING_PROJECT_PARAM, type BriefingResponse } from '../capture/api-contract';
import {
  BRIEFING_STDIN_TIMEOUT_MS,
  BriefingRouteMissingError,
  briefingDirectory,
  fetchBriefingText,
  runBriefing,
} from './briefing';

const env = { url: 'http://localhost:3000', token: `leon_${'a'.repeat(43)}` };
const PROJECT = 'github.com/davsperling/leon';

const briefing: BriefingResponse = {
  markdown: '# Point du matin · leon\n- La PR 22 est fusionnée.',
  projet: PROJECT,
  preparedAt: '2026-10-19T06:30:00.000Z',
};

const fetchReturning = (response: Response) => vi.fn(async () => response);
const asFetch = (fn: unknown) => fn as typeof fetch;
const folderKey = (path: string) =>
  `dossier:${createHash('sha256').update(path).digest('hex').slice(0, 16)}`;

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
      /ne prépare pas encore de point/,
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

  function setup(input: {
    stdin: Readable;
    env?: Record<string, string | undefined>;
    cwd?: string;
    remotes?: Record<string, string>;
    fetch?: ReturnType<typeof vi.fn>;
  }) {
    const out: string[] = [];
    const err: string[] = [];
    const fetchImpl = input.fetch ?? fetchReturning(Response.json(briefing));
    const git = vi.fn(async (_args: string[], cwd: string) => input.remotes?.[cwd] ?? null);
    const run = () =>
      runBriefing({
        stdin: input.stdin,
        env: input.env ?? serverEnv,
        cwd: input.cwd ?? '/leon',
        git,
        fetch: asFetch(fetchImpl),
        out: (text) => out.push(text),
        err: (text) => err.push(text),
      });
    const askedProject = () => {
      const [url] = (fetchImpl.mock.calls[0] ?? []) as unknown as [URL];
      return url?.searchParams.get(BRIEFING_PROJECT_PARAM);
    };
    return { run, out, err, git, fetchImpl, askedProject };
  }

  it('affiche le point du projet du JSON du crochet, et sort avec 0', async () => {
    const stdin = Readable.from([
      JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: '/projets/leon' }),
    ]);
    const { run, out, err, git, askedProject } = setup({
      stdin,
      env: { ...serverEnv, INIT_CWD: '/ailleurs' },
      remotes: { '/projets/leon': 'git@github.com:DavSperling/Leon.git' },
    });

    expect(await run()).toBe(0);

    expect(git).toHaveBeenCalledWith(['remote', 'get-url', 'origin'], '/projets/leon');
    expect(askedProject()).toBe(PROJECT);
    expect(out).toEqual([briefing.markdown]);
    expect(err).toEqual([]);
  });

  it('sans JSON du crochet, prend le dossier d’où pnpm a été lancé (INIT_CWD)', async () => {
    const { run, askedProject } = setup({
      stdin: Readable.from([]),
      env: { ...serverEnv, INIT_CWD: '/projets/sans-depot' },
    });

    expect(await run()).toBe(0);

    expect(askedProject()).toBe(folderKey('/projets/sans-depot'));
  });

  it('sans JSON ni INIT_CWD, prend le dossier du processus', async () => {
    const { run, askedProject } = setup({ stdin: Readable.from([]), cwd: '/projets/ici' });

    expect(await run()).toBe(0);

    expect(askedProject()).toBe(folderKey('/projets/ici'));
  });

  // Lancée à la main dans un terminal : l'entrée standard est le clavier, qui ne se ferme jamais.
  it('lancée à la main dans un terminal, n’attend pas l’entrée standard', async () => {
    const terminal = Object.assign(new Readable({ read() {} }), { isTTY: true });
    const { run, out, askedProject } = setup({
      stdin: terminal,
      env: { ...serverEnv, INIT_CWD: '/projets/client' },
    });
    try {
      const started = Date.now();

      expect(await run()).toBe(0);

      expect(Date.now() - started).toBeLessThan(BRIEFING_STDIN_TIMEOUT_MS);
      expect(askedProject()).toBe(folderKey('/projets/client'));
      expect(out).toEqual([briefing.markdown]);
    } finally {
      terminal.destroy();
    }
  });

  it('une entrée standard qui ne se ferme jamais ne la retient pas plus que le délai de lecture', async () => {
    const neverCloses = new Readable({ read() {} });
    const { run, askedProject } = setup({
      stdin: neverCloses,
      env: { ...serverEnv, INIT_CWD: '/projets/client' },
    });
    try {
      const started = Date.now();

      expect(await run()).toBe(0);

      expect(Date.now() - started).toBeLessThan(BRIEFING_STDIN_TIMEOUT_MS + 1000);
      expect(askedProject()).toBe(folderKey('/projets/client'));
    } finally {
      neverCloses.destroy();
    }
  });

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
      expect(err[0]).toMatch(/^Leon : /);
    },
  );

  it('sort avec 0 sans LEON_URL ni LEON_TOKEN, sans rien demander au serveur', async () => {
    const { run, out, err, fetchImpl } = setup({ stdin: Readable.from([]), env: {} });

    expect(await run()).toBe(0);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out).toEqual([]);
    expect(err.join('\n')).toMatch(/LEON_URL/);
  });
});
