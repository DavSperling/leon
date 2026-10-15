import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { collect, fakeFetch, testHttp } from './fake-fetch';

const URL_A = 'https://api.x.test/a';

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
    const { http, calls } = testHttp('github', ['api.x.test'], [{ url: URL_A, json: { n: 1 } }]);

    await expect(http.json({ url: URL_A }, z.object({ n: z.number() }))).resolves.toEqual({ n: 1 });
    expect(calls).toHaveLength(1);
  });

  it('collect rassemble les pages d’un itérable asynchrone', async () => {
    async function* pages() {
      yield { items: [], cursor: 'a' };
      yield { items: [], cursor: 'b' };
    }

    expect((await collect(pages())).map((page) => page.cursor)).toEqual(['a', 'b']);
  });
});
