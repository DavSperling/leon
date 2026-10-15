import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { type FakeRoute, fakeFetch } from '@/test/fake-fetch';
import { ConnectorAuthError, type ConnectorHttp, createConnectorHttp } from './http';

const HOST = 'api.x.test';
const URL_A = `https://${HOST}/a`;
const ANY = z.unknown();
const OBJECT = z.object({ ok: z.boolean() });

function setup(routes: FakeRoute[], extra: { minIntervalMs?: number } = {}) {
  const fetchImpl = fakeFetch(routes);
  const waits: number[] = [];
  const http: ConnectorHttp = createConnectorHttp({
    provider: 'github',
    hosts: [HOST],
    fetchImpl,
    sleep: async (ms) => {
      waits.push(ms);
    },
    ...extra,
  });
  return { http, calls: fetchImpl.calls, waits };
}

const ok = (extra: Partial<FakeRoute> = {}): FakeRoute => ({
  url: URL_A,
  json: { ok: true },
  ...extra,
});
const failing = (status: number, extra: Partial<FakeRoute> = {}): FakeRoute => ({
  url: URL_A,
  status,
  ...extra,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createConnectorHttp : requête', () => {
  it('envoie un GET avec la requête encodée', async () => {
    const { http, calls } = setup([ok()]);

    await http.json(
      { url: URL_A, query: { q: 'a b&c', n: 2, flag: true, none: undefined } },
      OBJECT,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('GET');
    expect(new URL(calls[0]?.url ?? '').searchParams.get('q')).toBe('a b&c');
    expect(calls[0]?.url).toContain('n=2');
    expect(calls[0]?.url).toContain('flag=true');
    expect(calls[0]?.url).not.toContain('none');
    expect(calls[0]?.headers.accept).toBe('application/json');
  });

  it('ajoute la requête à celle de l’adresse', async () => {
    const { http, calls } = setup([ok()]);

    await http.json({ url: `${URL_A}?a=1`, query: { b: 2 } }, OBJECT);

    expect(calls[0]?.url).toBe(`${URL_A}?a=1&b=2`);
  });

  it('répète le paramètre d’un tableau', async () => {
    const { http, calls } = setup([ok()]);

    await http.json({ url: URL_A, query: { t: ['x', 'y'] } }, OBJECT);

    expect(calls[0]?.url).toBe(`${URL_A}?t=x&t=y`);
  });

  it('envoie un POST en JSON avec les en-têtes demandés', async () => {
    const { http, calls } = setup([ok({ method: 'POST' })]);

    await http.json(
      { url: URL_A, method: 'POST', body: { q: 1 }, headers: { Authorization: 'Bearer test' } },
      OBJECT,
    );

    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.body).toEqual({ q: 1 });
    expect(calls[0]?.headers['content-type']).toBe('application/json');
    expect(calls[0]?.headers.authorization).toBe('Bearer test');
  });

  it('envoie un formulaire encodé, avec son type de contenu', async () => {
    const { http, calls } = setup([ok({ method: 'POST' })]);

    await http.json(
      { url: URL_A, method: 'POST', form: { code: 'a b&c', grant_type: 'authorization_code' } },
      OBJECT,
    );

    expect(calls[0]?.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(calls[0]?.body).toEqual({ code: 'a b&c', grant_type: 'authorization_code' });
  });

  it('refuse un formulaire et un corps JSON ensemble, sans appel ni valeur dans le message', async () => {
    const { http, calls } = setup([ok({ method: 'POST' })]);

    const error = await http
      .json({ url: URL_A, method: 'POST', form: { code: 'secret-123' }, body: { q: 1 } }, OBJECT)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({
      name: 'ConnectorHttpError',
      status: null,
      message: 'Requête invalide',
    });
    expect(calls).toHaveLength(0);
  });

  it('refuse les redirections et borne la durée de la requête', async () => {
    const seen: RequestInit[] = [];
    const http = createConnectorHttp({
      provider: 'github',
      hosts: [HOST],
      fetchImpl: async (_url, init) => {
        seen.push(init ?? {});
        return Response.json({ ok: true });
      },
    });

    await http.json({ url: URL_A }, OBJECT);

    expect(seen[0]?.redirect).toBe('manual');
    expect(seen[0]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('createConnectorHttp : adresses', () => {
  it('refuse un hôte hors de la liste, sans appel', async () => {
    const { http, calls } = setup([]);

    await expect(http.json({ url: 'https://evil.test/a' }, ANY)).rejects.toMatchObject({
      name: 'ConnectorHttpError',
      status: null,
      message: 'Adresse non autorisée',
    });
    expect(calls).toHaveLength(0);
  });

  it.each([
    `http://${HOST}/a`,
    `https://${HOST}.evil.test/a`,
    `https://${HOST}@evil.test/a`,
    `https://user:pass@${HOST}/a`,
    `https://${HOST}:8443/a`,
    'pas une adresse',
  ])('refuse %s', async (url) => {
    const { http, calls } = setup([]);

    await expect(http.json({ url }, ANY)).rejects.toThrow('Adresse non autorisée');
    expect(calls).toHaveLength(0);
  });

  it('accepte l’hôte quelle que soit la casse', async () => {
    const { http } = setup([{ url: URL_A, json: { ok: true } }]);

    await expect(http.json({ url: `https://${HOST.toUpperCase()}/a` }, OBJECT)).resolves.toEqual({
      ok: true,
    });
  });

  it('traite une redirection comme une erreur', async () => {
    const { http, calls } = setup([failing(302, { headers: { location: 'https://evil.test/a' } })]);

    await expect(http.json({ url: URL_A }, ANY)).rejects.toMatchObject({
      name: 'ConnectorHttpError',
      status: 302,
    });
    expect(calls).toHaveLength(1);
  });
});

describe('createConnectorHttp : codes de réponse', () => {
  it('lève ConnectorAuthError sur 401', async () => {
    const { http, calls } = setup([failing(401)]);

    const error = await http.json({ url: URL_A }, ANY).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConnectorAuthError);
    expect(error).toMatchObject({ status: 401, message: 'Clé refusée par GitHub' });
    expect(calls).toHaveLength(1);
  });

  it('lève ConnectorAuthError sur un 403 sans signe de limite', async () => {
    const { http } = setup([failing(403)]);

    await expect(http.json({ url: URL_A }, ANY)).rejects.toMatchObject({
      name: 'ConnectorAuthError',
      status: 403,
    });
  });

  it('lève ConnectorHttpError sur un autre code d’erreur, sans reprise', async () => {
    const { http, calls } = setup([failing(404)]);

    await expect(http.json({ url: URL_A }, ANY)).rejects.toMatchObject({
      name: 'ConnectorHttpError',
      status: 404,
      message: 'GitHub a répondu 404',
    });
    expect(calls).toHaveLength(1);
  });

  it('rend le corps d’un code listé dans acceptStatus', async () => {
    const { http } = setup([{ url: URL_A, status: 400, json: { ok: false } }]);

    await expect(http.json({ url: URL_A, acceptStatus: [400] }, OBJECT)).resolves.toEqual({
      ok: false,
    });
  });
});

describe('createConnectorHttp : reprises', () => {
  it('reprend après un 429 en respectant Retry-After en secondes', async () => {
    const { http, calls, waits } = setup([failing(429, { headers: { 'retry-after': '3' } }), ok()]);

    await expect(http.json({ url: URL_A }, OBJECT)).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([3000]);
  });

  it('respecte un Retry-After donné en date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
    const date = new Date('2026-10-15T10:00:05Z').toUTCString();
    const { http, waits } = setup([failing(503, { headers: { 'retry-after': date } }), ok()]);

    await http.json({ url: URL_A }, OBJECT);

    expect(waits).toEqual([5000]);
  });

  it('attend jusqu’à x-ratelimit-reset quand il n’y a pas de Retry-After', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
    const reset = String(Date.parse('2026-10-15T10:00:07Z') / 1000);
    const { http, waits } = setup([
      failing(403, { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset } }),
      ok(),
    ]);

    await http.json({ url: URL_A }, OBJECT);

    expect(waits).toEqual([7000]);
  });

  it('plafonne l’attente à 60 secondes', async () => {
    const { http, waits } = setup([failing(429, { headers: { 'retry-after': '3600' } }), ok()]);

    await http.json({ url: URL_A }, OBJECT);

    expect(waits).toEqual([60_000]);
  });

  it('abandonne un 503 après trois reprises, avec une attente de 2, 4 puis 8 secondes', async () => {
    const { http, calls, waits } = setup([failing(503), failing(503), failing(503), failing(503)]);

    await expect(http.json({ url: URL_A }, ANY)).rejects.toMatchObject({
      name: 'ConnectorHttpError',
      status: 503,
      message: 'GitHub a répondu 503',
    });
    expect(calls).toHaveLength(4);
    expect(waits).toEqual([2000, 4000, 8000]);
  });

  it('abandonne un 429 en parlant de limite de requêtes', async () => {
    const { http } = setup([failing(429), failing(429), failing(429), failing(429)]);

    await expect(http.json({ url: URL_A }, ANY)).rejects.toMatchObject({
      status: 429,
      message: 'Limite de requêtes de GitHub atteinte',
    });
  });

  it('traite un 403 avec x-ratelimit-remaining: 0 comme une limite, jamais comme une clé refusée', async () => {
    const limit = { 'x-ratelimit-remaining': '0' };
    const { http, calls } = setup([
      failing(403, { headers: limit }),
      failing(403, { headers: limit }),
      failing(403, { headers: limit }),
      failing(403, { headers: limit }),
    ]);

    const error = await http.json({ url: URL_A }, ANY).catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(ConnectorAuthError);
    expect(error).toMatchObject({
      name: 'ConnectorHttpError',
      status: 403,
      message: 'Limite de requêtes de GitHub atteinte',
    });
    expect(calls).toHaveLength(4);
  });

  it('traite un 403 avec Retry-After comme une limite', async () => {
    const { http } = setup([failing(403, { headers: { 'retry-after': '1' } }), ok()]);

    await expect(http.json({ url: URL_A }, OBJECT)).resolves.toEqual({ ok: true });
  });

  it('reprend après une erreur réseau puis réussit', async () => {
    let attempts = 0;
    const http = createConnectorHttp({
      provider: 'github',
      hosts: [HOST],
      sleep: async () => {},
      fetchImpl: async () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('fetch failed');
        return Response.json({ ok: true });
      },
    });

    await expect(http.json({ url: URL_A }, OBJECT)).resolves.toEqual({ ok: true });
    expect(attempts).toBe(2);
  });

  it('abandonne une erreur réseau après trois reprises, sans reprendre son message', async () => {
    let attempts = 0;
    const waits: number[] = [];
    const http = createConnectorHttp({
      provider: 'github',
      hosts: [HOST],
      sleep: async (ms) => {
        waits.push(ms);
      },
      fetchImpl: async () => {
        attempts += 1;
        throw new TypeError('connect ECONNREFUSED secret-123');
      },
    });

    await expect(http.json({ url: URL_A }, ANY)).rejects.toMatchObject({
      name: 'ConnectorHttpError',
      status: null,
      message: 'GitHub injoignable',
    });
    expect(attempts).toBe(4);
    expect(waits).toEqual([2000, 4000, 8000]);
  });
});

describe('createConnectorHttp : corps', () => {
  it('refuse un corps qui n’est pas du JSON', async () => {
    const { http } = setup([{ url: URL_A, text: '<html>Maintenance</html>' }]);

    await expect(http.json({ url: URL_A }, ANY)).rejects.toMatchObject({
      name: 'ConnectorHttpError',
      status: 200,
      message: 'Réponse illisible',
    });
  });

  it('refuse un JSON qui ne respecte pas le schéma', async () => {
    const { http } = setup([{ url: URL_A, json: { ok: 'oui' } }]);

    await expect(http.json({ url: URL_A }, OBJECT)).rejects.toMatchObject({
      name: 'ConnectorHttpError',
      status: 200,
      message: 'Réponse inattendue',
    });
  });

  const TEN_MB = 10 * 1024 * 1024;
  const jsonString = (bytes: number) => `"${'x'.repeat(bytes - 2)}"`;

  it('accepte un corps de 10 Mo', async () => {
    const { http } = setup([{ url: URL_A, text: jsonString(TEN_MB) }]);

    await expect(http.json({ url: URL_A }, z.string())).resolves.toHaveLength(TEN_MB - 2);
  });

  it('refuse un corps de 10 Mo plus un octet', async () => {
    const { http, calls } = setup([{ url: URL_A, text: jsonString(TEN_MB + 1) }]);

    await expect(http.json({ url: URL_A }, ANY)).rejects.toMatchObject({
      name: 'ConnectorHttpError',
      message: 'Réponse trop volumineuse',
    });
    expect(calls).toHaveLength(1);
  });

  it('refuse sur son seul en-tête content-length un corps annoncé trop gros', async () => {
    const { http } = setup([
      { url: URL_A, json: { ok: true }, headers: { 'content-length': String(TEN_MB + 1) } },
    ]);

    await expect(http.json({ url: URL_A }, ANY)).rejects.toThrow('Réponse trop volumineuse');
  });
});

describe('createConnectorHttp : aucun secret dans les erreurs', () => {
  const secretUrl = `${URL_A}?key=secret-123`;
  const cases: Array<[string, FakeRoute, number]> = [
    ['500', { url: /./, status: 500, text: '{"error":"secret-xyz"}' }, 4],
    ['429', { url: /./, status: 429, text: 'secret-xyz' }, 4],
    ['401', { url: /./, status: 401, text: 'secret-xyz' }, 1],
    ['404', { url: /./, status: 404, json: { error: 'secret-xyz' } }, 1],
    ['302', { url: /./, status: 302, headers: { location: 'https://evil.test/?secret-xyz' } }, 1],
    ['non JSON', { url: /./, text: 'secret-xyz' }, 1],
    ['schéma', { url: /./, json: 'secret-xyz' }, 1],
  ];

  it.each(cases)('%s', async (_name, route, attempts) => {
    const { http } = setup(Array.from({ length: attempts }, () => route));

    const error = await http.json({ url: secretUrl }, OBJECT).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).not.toContain('secret-123');
    expect(message).not.toContain('secret-xyz');
    expect(message).not.toContain(HOST);
  });
});

describe('createConnectorHttp : requête inutilisable', () => {
  // Une clé collée avec un retour à la ligne, un point de suspension ou un caractère nul : Node
  // refuse la valeur et cite la valeur entière dans son erreur. Rien de cela ne doit sortir.
  const keys = [
    ['un retour à la ligne', 'Bearer secret-123\nsuite'],
    ['un caractère hors Latin-1', 'Bearer secret-123…suite'],
    ['un caractère nul', 'Bearer secret-123\u0000suite'],
  ] as const;

  it.each(keys)('refuse un en-tête qui contient %s, sans appel ni reprise', async (_name, key) => {
    const { http, calls, waits } = setup([ok()]);

    const error = await http
      .json({ url: URL_A, headers: { Authorization: key } }, OBJECT)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ name: 'ConnectorHttpError', status: null });
    expect((error as Error).message).not.toContain('secret-123');
    expect((error as Error).message).not.toContain('Bearer');
    expect(calls).toHaveLength(0);
    expect(waits).toEqual([]);
  });

  it('refuse de même un nom d’en-tête invalide, sans reprendre le nom', async () => {
    const { http, calls } = setup([ok()]);

    const error = await http
      .json({ url: URL_A, headers: { 'nom invalide': 'x' } }, OBJECT)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ name: 'ConnectorHttpError', status: null });
    expect((error as Error).message).not.toContain('nom invalide');
    expect(calls).toHaveLength(0);
  });

  it('refuse un corps qui ne se met pas en JSON, sans appel ni reprise', async () => {
    const { http, calls, waits } = setup([ok({ method: 'POST' })]);

    const error = await http
      .json({ url: URL_A, method: 'POST', body: { n: 1n } }, OBJECT)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ name: 'ConnectorHttpError', status: null });
    expect(calls).toHaveLength(0);
    expect(waits).toEqual([]);
  });
});

describe('createConnectorHttp : page', () => {
  it('rend l’adresse marquée rel="next" de l’en-tête Link', async () => {
    const link = `<${URL_A}?cursor=1>; rel="prev", <${URL_A}?cursor=3>; rel="next"`;
    const { http } = setup([ok({ headers: { link } })]);

    await expect(http.page({ url: URL_A }, OBJECT)).resolves.toEqual({
      data: { ok: true },
      nextUrl: `${URL_A}?cursor=3`,
    });
  });

  it('rend null sans en-tête Link ni rel="next"', async () => {
    const { http } = setup([ok(), ok({ headers: { link: `<${URL_A}?c=0>; rel="prev"` } })]);

    expect((await http.page({ url: URL_A }, OBJECT)).nextUrl).toBeNull();
    expect((await http.page({ url: URL_A }, OBJECT)).nextUrl).toBeNull();
  });

  it('rend null quand le lien porte results="false"', async () => {
    const link = `<${URL_A}?cursor=9>; rel="next"; results="false"; cursor="9"`;
    const { http } = setup([ok({ headers: { link } })]);

    expect((await http.page({ url: URL_A }, OBJECT)).nextUrl).toBeNull();
  });

  it('refuse un lien suivant illisible', async () => {
    const { http } = setup([ok({ headers: { link: '<http://[>; rel="next"' } })]);

    await expect(http.page({ url: URL_A }, OBJECT)).rejects.toMatchObject({
      name: 'ConnectorHttpError',
      message: 'Réponse inattendue',
    });
  });

  it('refuse à l’appel suivant une adresse d’un autre hôte', async () => {
    const link = '<https://evil.test/a?cursor=2>; rel="next"';
    const { http, calls } = setup([ok({ headers: { link } })]);

    const { nextUrl } = await http.page({ url: URL_A }, OBJECT);

    expect(nextUrl).not.toBeNull();
    await expect(http.page({ url: nextUrl ?? '' }, OBJECT)).rejects.toThrow(
      'Adresse non autorisée',
    );
    expect(calls).toHaveLength(1);
  });
});

describe('createConnectorHttp : intervalle minimal', () => {
  it('espace deux requêtes d’au moins minIntervalMs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const times: number[] = [];
    const waits: number[] = [];
    const http = createConnectorHttp({
      provider: 'notion',
      hosts: [HOST],
      minIntervalMs: 350,
      sleep: async (ms) => {
        waits.push(ms);
        vi.setSystemTime(Date.now() + ms);
      },
      fetchImpl: async () => {
        times.push(Date.now());
        return Response.json({ ok: true });
      },
    });

    await http.json({ url: URL_A }, OBJECT);
    await http.json({ url: URL_A }, OBJECT);
    await http.json({ url: URL_A }, OBJECT);

    expect(times).toEqual([0, 350, 700]);
    expect(waits).toEqual([350, 350]);
  });

  it('n’attend pas quand l’intervalle est déjà écoulé', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { http, waits } = setup([ok(), ok()], { minIntervalMs: 350 });

    await http.json({ url: URL_A }, OBJECT);
    vi.setSystemTime(1000);
    await http.json({ url: URL_A }, OBJECT);

    expect(waits).toEqual([]);
  });
});
