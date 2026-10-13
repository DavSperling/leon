import { describe, expect, it, vi } from 'vitest';
import type { CapturedExchange } from './exchange';
import { installFetchInterceptor } from './intercept';
import type { SiteParser } from './parsers/site-parser';

const COMPLETION = 'https://claude.ai/completion';
const SSE = 'data: un\n\ndata: deux\n\n';
const NOW = new Date('2026-10-13T09:30:00.000Z');

const exchangeFrom = (requestBody: string | null, sseText: string): CapturedExchange => ({
  site: 'claude_ai',
  conversationId: 'conv',
  title: null,
  user: { messageId: 'u', text: requestBody ?? '(aucun)', ts: NOW.toISOString() },
  assistant: { messageId: 'a', text: sseText, ts: NOW.toISOString() },
});

const fakeParser = (parse?: SiteParser['parse']): SiteParser => ({
  site: 'claude_ai',
  matchesRequest: (url, method) => method === 'POST' && url.href === COMPLETION,
  parse: parse ?? (async ({ requestBody, sseText }) => exchangeFrom(requestBody, sseText)),
});

// Flux en plusieurs morceaux, comme un vrai SSE ; failAfter coupe le flux après le premier morceau.
function sseStream(chunks: string[], failAfter = false): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const [first, ...rest] = chunks;
      if (first !== undefined) controller.enqueue(encoder.encode(first));
      if (failAfter) return controller.error(new Error('connexion coupée'));
      for (const chunk of rest) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

const sseResponse = (init: { status?: number; contentType?: string; failAfter?: boolean } = {}) =>
  new Response(sseStream(['data: un\n\n', 'data: deux\n\n'], init.failAfter), {
    status: init.status ?? 200,
    headers: { 'content-type': init.contentType ?? 'text/event-stream; charset=utf-8' },
  });

function setup(response: () => Response | Promise<Response>, parser = fakeParser()) {
  const original = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
  const target = { fetch: original as typeof fetch };
  const emit = vi.fn();
  installFetchInterceptor(target, [parser], emit, () => NOW);
  return { target, original, emit };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('installFetchInterceptor', () => {
  it("renvoie telle quelle la réponse d'une URL sans parseur", async () => {
    const original = new Response('{}', { headers: { 'content-type': 'application/json' } });
    const { target, emit } = setup(() => original);
    const response = await target.fetch('https://claude.ai/api/autre', { method: 'POST' });
    expect(response).toBe(original);
    await settle();
    expect(emit).not.toHaveBeenCalled();
  });

  it("laisse la page lire tout le flux et émet l'échange", async () => {
    const { target, original, emit } = setup(() => sseResponse());
    const init = { method: 'POST', body: '{"prompt":"Bonjour"}' };
    const response = await target.fetch(COMPLETION, init);
    expect(original).toHaveBeenCalledWith(COMPLETION, init);
    expect(await response.text()).toBe(SSE);
    await vi.waitFor(() => expect(emit).toHaveBeenCalledWith(exchangeFrom(init.body, SSE)));
  });

  it('ne casse pas la page quand le parseur lève', async () => {
    const parser = fakeParser(async () => {
      throw new Error('format inconnu');
    });
    const { target, emit } = setup(() => sseResponse(), parser);
    const response = await target.fetch(COMPLETION, { method: 'POST', body: '{}' });
    expect(await response.text()).toBe(SSE);
    await settle();
    expect(emit).not.toHaveBeenCalled();
  });

  it.each([
    ['sans text/event-stream', { contentType: 'application/json' }],
    ['en erreur', { status: 500 }],
  ])('ignore une réponse %s', async (_label, init) => {
    const parse = vi.fn(fakeParser().parse);
    const original = sseResponse(init);
    const { target, emit } = setup(() => original, fakeParser(parse));
    const response = await target.fetch(COMPLETION, { method: 'POST', body: '{}' });
    expect(response).toBe(original);
    await settle();
    expect(parse).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("lit le corps d'un objet Request avant l'appel d'origine", async () => {
    const original = vi.fn(async (input: RequestInfo | URL) => {
      await (input as Request).text(); // l'original consomme le corps
      return sseResponse();
    });
    const target = { fetch: original as typeof fetch };
    const emit = vi.fn();
    installFetchInterceptor(target, [fakeParser()], emit, () => NOW);
    const request = new Request(COMPLETION, { method: 'POST', body: '{"prompt":"Requête"}' });
    const response = await target.fetch(request);
    expect(await response.text()).toBe(SSE);
    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith(exchangeFrom('{"prompt":"Requête"}', SSE)),
    );
  });

  it('laisse à la page le rejet d’un objet Request au corps déjà lu', async () => {
    const original = vi.fn(async (input: RequestInfo | URL) => {
      await (input as Request).text(); // comme fetch : corps déjà consommé, rejet
      return sseResponse();
    });
    const target = { fetch: original as typeof fetch };
    const emit = vi.fn();
    installFetchInterceptor(target, [fakeParser()], emit, () => NOW);
    const request = new Request(COMPLETION, { method: 'POST', body: '{}' });
    await request.text();
    await expect(target.fetch(request)).rejects.toThrow();
    expect(original).toHaveBeenCalledWith(request, undefined);
    await settle();
    expect(emit).not.toHaveBeenCalled();
  });

  it("n'émet rien et ne lève rien quand le flux échoue en cours de lecture", async () => {
    const { target, emit } = setup(() => sseResponse({ failAfter: true }));
    const response = await target.fetch(COMPLETION, { method: 'POST', body: '{}' });
    // La page voit l'erreur du flux d'origine, comme sans extension.
    await expect(response.text()).rejects.toThrow('connexion coupée');
    await settle();
    expect(emit).not.toHaveBeenCalled();
  });

  it("transmet à la page le rejet de l'appel d'origine", async () => {
    const { target, emit } = setup(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(target.fetch(COMPLETION, { method: 'POST', body: '{}' })).rejects.toThrow(
      'Failed to fetch',
    );
    await settle();
    expect(emit).not.toHaveBeenCalled();
  });
});
