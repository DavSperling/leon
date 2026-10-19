import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS, type BriefingResponse } from '../capture/api-contract';
import { BriefingRouteMissingError, fetchBriefingText } from './briefing';

const env = { url: 'http://localhost:3000', token: `leon_${'a'.repeat(43)}` };

const briefing: BriefingResponse = {
  markdown: '# Point du matin · leon\n- La PR 22 est fusionnée.',
  projet: 'github.com/davsperling/leon',
  preparedAt: '2026-10-19T06:30:00.000Z',
};

const fetchReturning = (response: Response) => vi.fn(async () => response);
const asFetch = (fn: unknown) => fn as typeof fetch;

afterEach(() => vi.restoreAllMocks());

describe('fetchBriefingText', () => {
  it('renvoie le markdown d’une réponse conforme, en présentant le jeton', async () => {
    const fetchImpl = fetchReturning(Response.json(briefing));

    const text = await fetchBriefingText(asFetch(fetchImpl), env);

    expect(text).toBe(briefing.markdown);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe(new URL(API_PATHS.briefing, env.url).href);
    expect(init.headers).toEqual({ Authorization: `Bearer ${env.token}` });
  });

  it.each([
    ['un 401', new Response('{}', { status: 401 })],
    ['un 500', new Response('{}', { status: 500 })],
    ['un corps non conforme', Response.json({ markdown: 3 })],
    ['un corps non JSON', new Response('<html>', { status: 200 })],
  ])('renvoie null sur %s', async (_name, response) => {
    expect(await fetchBriefingText(asFetch(fetchReturning(response)), env)).toBeNull();
  });

  // Un 404 n'est ni un jeton refusé ni un serveur injoignable : la route n'existe pas sur ce serveur.
  // L'erreur remonte pour que la commande le dise (elle sort quand même avec le code 0).
  it('signale une route absente sur un 404, au lieu de dire « serveur injoignable »', async () => {
    const fetchImpl = fetchReturning(new Response('{}', { status: 404 }));

    await expect(fetchBriefingText(asFetch(fetchImpl), env)).rejects.toThrow(
      BriefingRouteMissingError,
    );
    await expect(fetchBriefingText(asFetch(fetchImpl), env)).rejects.toThrow(
      /ne prépare pas encore de point/,
    );
  });

  it('renvoie null sur une erreur réseau', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });

    expect(await fetchBriefingText(asFetch(fetchImpl), env)).toBeNull();
  });

  it('renvoie null quand le délai de 3 secondes est dépassé', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.timeout(20));
    const neverAnswers = (_url: URL, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });

    expect(await fetchBriefingText(asFetch(neverAnswers), env)).toBeNull();
    expect(timeout).toHaveBeenCalledWith(3000);
  });
});
