import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AnyConnector } from '@/server/connectors/types';
import { collect, expectHostsWellFormed, fakeFetch, testHttp } from './fake-fetch';

const URL_A = 'https://api.x.test/a';

// Un connecteur réduit à ce que testHttp lit : le schéma de la config et les hôtes.
const connectorFor = (hosts: (config: Record<string, unknown>) => string[]): AnyConnector => ({
  id: 'github',
  configSchema: z.object({ site: z.string().trim().toLowerCase().default('api') }),
  secretFields: [],
  hosts,
  verify: async () => ({ account: 'Marie' }),
  async *sync() {},
});

describe('fakeFetch', () => {
  it('sert chaque route une fois, puis la suivante qui correspond', async () => {
    const fetchImpl = fakeFetch([
      { url: URL_A, json: { page: 1 } },
      { url: URL_A, status: 201, text: 'deux' },
    ]);

    const first = await fetchImpl(URL_A);
    const second = await fetchImpl(URL_A);

    expect(await first.json()).toEqual({ page: 1 });
    expect(first.headers.get('content-type')).toBe('application/json');
    expect(second.status).toBe(201);
    expect(await second.text()).toBe('deux');
  });

  it('compare une chaîne à l’adresse complète ou sans sa chaîne de requête', async () => {
    const fetchImpl = fakeFetch([
      { url: URL_A, json: 1 },
      { url: `${URL_A}?b=2`, json: 2 },
      { url: /\/c\?x=/, json: 3 },
    ]);

    expect((await fetchImpl(`${URL_A}?since=2026`)).status).toBe(200);
    expect((await fetchImpl(`${URL_A}?b=2`)).status).toBe(200);
    expect((await fetchImpl('https://api.x.test/c?x=1')).status).toBe(200);
  });

  it('distingue GET et POST et note chaque appel', async () => {
    const fetchImpl = fakeFetch([{ method: 'POST', url: URL_A, json: { ok: true } }]);

    await fetchImpl(URL_A, {
      method: 'POST',
      headers: { Authorization: 'Bearer test' },
      body: JSON.stringify({ q: 1 }),
    });

    expect(fetchImpl.calls).toEqual([
      { method: 'POST', url: URL_A, headers: { authorization: 'Bearer test' }, body: { q: 1 } },
    ]);
  });
});

describe('testHttp et collect', () => {
  it('branche un client sur de fausses routes et rend les appels', async () => {
    const connector = connectorFor(() => ['api.x.test']);
    const { http, calls } = testHttp(connector, {}, [{ url: URL_A, json: { n: 1 } }]);

    await expect(http.json({ url: URL_A }, z.object({ n: z.number() }))).resolves.toEqual({ n: 1 });
    expect(calls).toHaveLength(1);
  });

  it('prend les hôtes du connecteur, pas ceux de l’auteur du test : une route ailleurs échoue', async () => {
    const connector = connectorFor(() => ['autre.test']);
    const { http, calls } = testHttp(connector, {}, [{ url: URL_A, json: { n: 1 } }]);

    await expect(http.json({ url: URL_A }, z.unknown())).rejects.toThrow('Adresse non autorisée');
    expect(calls).toHaveLength(0);
  });

  it('passe la config par le schéma du connecteur avant de lui demander ses hôtes', async () => {
    const connector = connectorFor((config) => [`${String(config.site)}.x.test`]);
    const { http } = testHttp(connector, { site: ' Acme ' }, [
      { url: 'https://acme.x.test/a', json: { n: 1 } },
    ]);

    await expect(http.json({ url: 'https://acme.x.test/a' }, z.unknown())).resolves.toEqual({
      n: 1,
    });
  });

  it('refuse une config que le schéma refuse', () => {
    const connector = connectorFor(() => ['api.x.test']);

    expect(() => testHttp(connector, { site: 3 }, [])).toThrow();
  });

  it('fait échouer le test quand les hôtes du connecteur sont mal formés', () => {
    expect(() =>
      testHttp(
        connectorFor(() => ['Api.x.test']),
        {},
        [],
      ),
    ).toThrow();
    expect(() =>
      testHttp(
        connectorFor(() => []),
        {},
        [],
      ),
    ).toThrow();
  });

  it('collect rassemble les pages d’un itérable asynchrone', async () => {
    async function* pages() {
      yield { items: [], cursor: 'a' };
      yield { items: [], cursor: 'b' };
    }

    expect((await collect(pages())).map((page) => page.cursor)).toEqual(['a', 'b']);
  });
});

describe('expectHostsWellFormed', () => {
  it('accepte des hôtes exacts en minuscules', () => {
    expect(() => expectHostsWellFormed(['api.github.com', 'acme.zendesk.com', 'a'])).not.toThrow();
  });

  it.each([
    ['une liste vide', []],
    ['une chaîne vide', ['']],
    ['un schéma', ['https://api.x.test']],
    ['un port', ['api.x.test:8443']],
    ['un chemin', ['api.x.test/v1']],
    ['un joker', ['*.x.test']],
    ['un point final', ['api.x.test.']],
    ['une majuscule', ['Api.x.test']],
    ['un tiret bas', ['a_b.x.test']],
    ['un espace', ['api .x.test']],
  ])('refuse %s', (_name, hosts) => {
    expect(() => expectHostsWellFormed(hosts)).toThrow();
  });
});
