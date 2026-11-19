import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { CapturedExchange } from './exchange';
import { installFetchInterceptor, STREAM_MAX_CHARS } from './intercept';
import { chatgptParser } from './parsers/chatgpt';
import type { SiteParser } from './parsers/site-parser';

const COMPLETION = 'https://claude.ai/completion';
const CHATGPT = 'https://chatgpt.com/backend-api/f/conversation';
const SSE = 'data: un\n\ndata: deux\n\n';
const NOW = new Date('2026-10-13T09:30:00.000Z');
const fixture = (name: string) =>
  readFileSync(new URL(`./parsers/fixtures/${name}`, import.meta.url), 'utf8');

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

// Flux livré morceau par morceau, comme un vrai SSE. error : levée un peu après le dernier morceau, comme quand la
// page de ChatGPT annule son appel une fois le flux reçu.
function sseStream(chunks: string[], error?: Error): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let next = 0;
  return new ReadableStream({
    async pull(controller) {
      const chunk = chunks[next++];
      if (chunk !== undefined) {
        controller.enqueue(encoder.encode(chunk));
      } else if (error) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        controller.error(error);
      } else {
        controller.close();
      }
    },
  });
}

type FakeResponse = { status?: number; contentType?: string; chunks?: string[]; error?: Error };
const sseResponse = (init: FakeResponse = {}) =>
  new Response(sseStream(init.chunks ?? ['data: un\n\n', 'data: deux\n\n'], init.error), {
    status: init.status ?? 200,
    headers: { 'content-type': init.contentType ?? 'text/event-stream; charset=utf-8' },
  });

const abortError = () => new DOMException('The user aborted a request.', 'AbortError');
// Le flux réel de ChatGPT en morceaux de 200 caractères (le vrai en comptait 13 pour 8 240).
const inChunks = (text: string) => text.match(/[\s\S]{1,200}/g) ?? [];

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

  it("laisse la page lire tout le flux de la réponse d'origine et émet l'échange", async () => {
    const sent = sseResponse();
    const { target, original, emit } = setup(() => sent);
    const init = { method: 'POST', body: '{"prompt":"Bonjour"}' };
    const response = await target.fetch(COMPLETION, init);
    expect(original).toHaveBeenCalledWith(COMPLETION, init);
    expect(response).toBe(sent);
    expect(await response.text()).toBe(SSE);
    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith({ exchange: exchangeFrom(init.body, SSE) }),
    );
  });

  it("capte le flux reçu en entier quand la page annule ensuite l'appel (AbortError)", async () => {
    const { target, emit } = setup(() => sseResponse({ error: abortError() }));
    const response = await target.fetch(COMPLETION, { method: 'POST', body: '{}' });
    await expect(response.text()).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith({ exchange: exchangeFrom('{}', SSE) }),
    );
  });

  it("capte l'échange ChatGPT réel lu jusqu'à l'annulation de la page", async () => {
    const chunks = inChunks(fixture('chatgpt-reel.sse'));
    const { target, emit } = setup(
      () => sseResponse({ chunks, error: abortError() }),
      chatgptParser,
    );
    const body = fixture('chatgpt-reel-request.json');
    await target.fetch(CHATGPT, { method: 'POST', body });
    await vi.waitFor(() =>
      expect(emit.mock.calls[0]?.[0].exchange?.assistant.text).toBe(
        'Comptez dix jours, pas moins.',
      ),
    );
  });

  it('rejette comme incomplet un flux ChatGPT coupé avant la fin', async () => {
    const real = fixture('chatgpt-reel.sse');
    const chunks = inChunks(real.slice(0, real.indexOf('"o": "patch"')));
    const { target, emit } = setup(
      () => sseResponse({ chunks, error: new TypeError('network error') }),
      chatgptParser,
    );
    await target.fetch(CHATGPT, { method: 'POST', body: fixture('chatgpt-reel-request.json') });
    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith({ rejection: { site: 'chatgpt', reason: 'incomplet' } }),
    );
  });

  it("passe à l'analyseur ce qui est arrivé quand le flux est coupé", async () => {
    const parse = vi.fn(fakeParser().parse);
    const { target } = setup(
      () => sseResponse({ chunks: ['data: un\n\n'], error: new Error('connexion coupée') }),
      fakeParser(parse),
    );
    const response = await target.fetch(COMPLETION, { method: 'POST', body: '{}' });
    // La page voit l'erreur du flux d'origine, comme sans extension.
    await expect(response.text()).rejects.toThrow('connexion coupée');
    await vi.waitFor(() =>
      expect(parse).toHaveBeenCalledWith(expect.objectContaining({ sseText: 'data: un\n\n' })),
    );
  });

  it("rejette comme incomplet, sans l'analyser, un flux plus gros que la borne", async () => {
    const parse = vi.fn(fakeParser().parse);
    const half = 'a'.repeat(STREAM_MAX_CHARS / 2 + 1);
    const { target, emit } = setup(
      () => sseResponse({ chunks: [half, half, 'data: fin\n\n'] }),
      fakeParser(parse),
    );
    const response = await target.fetch(COMPLETION, { method: 'POST', body: '{}' });
    expect(await response.text()).toHaveLength(half.length * 2 + 'data: fin\n\n'.length);
    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith({ rejection: { site: 'claude_ai', reason: 'incomplet' } }),
    );
    expect(parse).not.toHaveBeenCalled();
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

  it('ne casse pas la page quand l’émission lève', async () => {
    const original = sseResponse({ contentType: 'application/json' });
    const target = { fetch: (async () => original) as typeof fetch };
    installFetchInterceptor(target, [fakeParser()], () => {
      throw new Error('postMessage impossible');
    });
    expect(await target.fetch(COMPLETION, { method: 'POST', body: '{}' })).toBe(original);
  });

  it('rejette comme format une réponse ok sans text/event-stream, sans l’analyser', async () => {
    const parse = vi.fn(fakeParser().parse);
    const original = sseResponse({ contentType: 'application/json' });
    const { target, emit } = setup(() => original, fakeParser(parse));
    const response = await target.fetch(COMPLETION, { method: 'POST', body: '{}' });
    expect(response).toBe(original);
    expect(emit).toHaveBeenCalledExactlyOnceWith({
      rejection: { site: 'claude_ai', reason: 'format' },
    });
    await settle();
    expect(parse).not.toHaveBeenCalled();
  });

  it('ne dit rien d’une réponse en erreur', async () => {
    const parse = vi.fn(fakeParser().parse);
    const original = sseResponse({ status: 500 });
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
      expect(emit).toHaveBeenCalledWith({ exchange: exchangeFrom('{"prompt":"Requête"}', SSE) }),
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

  it("transmet à la page le rejet de l'appel d'origine", async () => {
    const { target, emit } = setup(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(target.fetch(COMPLETION, { method: 'POST', body: '{}' })).rejects.toThrow(
      'Failed to fetch',
    );
    await settle();
    expect(emit).not.toHaveBeenCalled();
  });
});
