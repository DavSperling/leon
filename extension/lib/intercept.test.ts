import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { CapturedExchange } from './exchange';
import { installFetchInterceptor, STREAM_MAX_CHARS } from './intercept';
import { chatgptParser } from './parsers/chatgpt';
import { createClaudeAiParser } from './parsers/claude-ai';
import {
  CONV,
  concat,
  envelope,
  exchangeEnvelopes,
  gzip,
  heartbeat,
  proto,
  RPC,
  sendBody,
  smallActionBody,
} from './parsers/fixtures/claude-ai-frames';
import type { SiteParser, StreamParser } from './parsers/site-parser';

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

// Flux livré morceau par morceau, comme un vrai SSE (un morceau en octets peut couper un caractère). error : levée un
// peu après le dernier morceau, comme quand la page de ChatGPT annule son appel une fois le flux reçu.
function sseStream(chunks: Array<string | Uint8Array>, error?: Error): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let next = 0;
  return new ReadableStream({
    async pull(controller) {
      const chunk = chunks[next++];
      if (chunk !== undefined) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      } else if (error) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        controller.error(error);
      } else {
        controller.close();
      }
    },
  });
}

type FakeResponse = {
  status?: number;
  contentType?: string;
  chunks?: Array<string | Uint8Array>;
  error?: Error;
};
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

  it('recolle un caractère coupé entre deux morceaux du flux', async () => {
    const bytes = new TextEncoder().encode('data: Délais\n\n');
    // « data: D » fait 7 octets : la coupure tombe entre les deux octets du « é ».
    const { target, emit } = setup(() =>
      sseResponse({ chunks: [bytes.subarray(0, 8), bytes.subarray(8)] }),
    );
    await target.fetch(COMPLETION, { method: 'POST', body: '{}' });
    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith({ exchange: exchangeFrom('{}', 'data: Délais\n\n') }),
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
    const cancel = vi.spyOn(ReadableStreamDefaultReader.prototype, 'cancel');
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
    // La copie est annulée : sinon elle garderait en file tout ce que la page lit encore.
    expect(cancel).toHaveBeenCalled();
    cancel.mockRestore();
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

  it('ne dit rien quand l’analyseur rend null (une régénération)', async () => {
    const { target, emit } = setup(
      () => sseResponse(),
      fakeParser(async () => null),
    );
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

describe('installFetchInterceptor : claude.ai au fil de l’eau', () => {
  const PERFORM = `${RPC}/PerformAction`;
  const TIMELINE = `${RPC}/StreamTimeline`;
  const X = {
    userId: '6e1d2f30-2b3c-4d4e-9f00-00000000b001',
    replyId: '6e1d2f30-2b3c-4d4e-9f00-00000000b002',
    userText: 'Peut-on livrer le client inventé vendredi ?',
    reply: ['Vendredi tient si la recette inventée passe jeudi.'],
  };
  const captured = {
    site: 'claude_ai',
    conversationId: CONV,
    title: null,
    user: { messageId: X.userId, text: X.userText, ts: expect.any(String) },
    assistant: { messageId: X.replyId, text: X.reply[0], ts: expect.any(String) },
  };
  const sendInit = async (): Promise<RequestInit> => ({
    method: 'POST',
    headers: { 'content-type': 'application/proto', 'content-encoding': 'gzip' },
    body: await gzip(sendBody({ userId: X.userId, replyId: X.replyId, text: X.userText })),
  });
  const timelineInit = { method: 'POST', body: envelope(proto([1, CONV])) };

  // Un flux d'octets piloté par le test : il reste ouvert tant qu'on ne le ferme pas.
  function pagedStream() {
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    return {
      body,
      push: (bytes: Uint8Array) => controller?.enqueue(bytes),
      fail: (error: Error) => controller?.error(error),
    };
  }
  const timelineResponse = (
    body: ReadableStream<Uint8Array>,
    contentType = 'application/connect+proto',
  ) =>
    new Response(body, {
      headers: { 'content-type': contentType, 'connect-content-encoding': 'gzip' },
    });

  // Le réseau de la page : PerformAction répond 7 octets, chaque StreamTimeline prend le flux suivant.
  function setupClaude(timelines: Response[], emit = vi.fn()) {
    const original = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const href = input instanceof Request ? input.url : String(input);
      if (href.endsWith('/PerformAction')) {
        // L'original consomme le corps.
        if (input instanceof Request) await input.arrayBuffer();
        if (init?.body instanceof ReadableStream) await new Response(init.body).arrayBuffer();
        return new Response(proto([6, 4]), { headers: { 'content-type': 'application/proto' } });
      }
      const next = timelines.shift();
      if (!next) throw new Error('aucun flux prévu');
      return next;
    });
    const target = { fetch: original as typeof fetch };
    installFetchInterceptor(target, [createClaudeAiParser(() => NOW), chatgptParser], emit);
    return { target, emit };
  }

  // La page lit son flux jusqu'à en avoir size octets.
  async function readBytes(reader: ReadableStreamDefaultReader<Uint8Array>, size: number) {
    const parts: Uint8Array[] = [];
    let got = 0;
    while (got < size) {
      const { value, done } = await reader.read();
      if (done) break;
      parts.push(value);
      got += value.length;
    }
    return concat(parts);
  }

  it("émet l'échange d'un flux resté ouvert sans attendre sa fin ; la page lit tout son flux", async () => {
    const stream = pagedStream();
    const sent = timelineResponse(stream.body);
    const { target, emit } = setupClaude([sent]);
    const page = await target.fetch(TIMELINE, timelineInit);
    expect(page).toBe(sent);
    await target.fetch(PERFORM, await sendInit());
    const envelopes = await exchangeEnvelopes(X);
    const all = concat(envelopes);
    // Des morceaux qui coupent les enveloppes n'importe où.
    for (let at = 0; at < all.length; at += 333) stream.push(all.slice(at, at + 333));
    await vi.waitFor(() => expect(emit).toHaveBeenCalledExactlyOnceWith({ exchange: captured }));
    const reader = page.body?.getReader();
    if (!reader) throw new Error('pas de corps');
    expect(await readBytes(reader, all.length)).toEqual(all);
    // Le flux reste ouvert : les battements suivants passent toujours.
    stream.push(envelope(heartbeat(9)));
    expect(await readBytes(reader, 11)).toEqual(envelope(heartbeat(9)));
  });

  it("ne dit rien d'un flux coupé au milieu d'une enveloppe ; la page voit la coupure", async () => {
    const stream = pagedStream();
    const { target, emit } = setupClaude([timelineResponse(stream.body)]);
    const page = await target.fetch(TIMELINE, timelineInit);
    await target.fetch(PERFORM, await sendInit());
    const all = concat(await exchangeEnvelopes(X));
    stream.push(all.subarray(0, all.length - 10));
    stream.fail(new TypeError('network error'));
    await expect(page.arrayBuffer()).rejects.toThrow('network error');
    await settle();
    expect(emit).not.toHaveBeenCalled();
  });

  it('émet l’échange quand le flux finit par AbortError et que le suivant livre la suite', async () => {
    const first = pagedStream();
    const second = pagedStream();
    const { target, emit } = setupClaude([
      timelineResponse(first.body),
      timelineResponse(second.body),
    ]);
    const page = await target.fetch(TIMELINE, timelineInit);
    await target.fetch(PERFORM, await sendInit());
    const envelopes = await exchangeEnvelopes(X);
    for (const one of envelopes.slice(0, 8)) first.push(one);
    // Comme sur le réseau, l'annulation vient après des morceaux déjà lus : une erreur vide la file d'un flux.
    await settle();
    first.fail(abortError());
    await expect(page.arrayBuffer()).rejects.toMatchObject({ name: 'AbortError' });
    await settle();
    expect(emit).not.toHaveBeenCalled();
    await target.fetch(TIMELINE, timelineInit);
    for (const one of envelopes.slice(8)) second.push(one);
    await vi.waitFor(() => expect(emit).toHaveBeenCalledExactlyOnceWith({ exchange: captured }));
  });

  it("lit le corps d'un objet Request avant que l'appel d'origine le consomme", async () => {
    const stream = pagedStream();
    const { target, emit } = setupClaude([timelineResponse(stream.body)]);
    await target.fetch(TIMELINE, timelineInit);
    await target.fetch(new Request(PERFORM, await sendInit()));
    for (const one of await exchangeEnvelopes(X)) stream.push(one);
    await vi.waitFor(() => expect(emit).toHaveBeenCalledExactlyOnceWith({ exchange: captured }));
  });

  it("laisse à la page un corps d'envoi en flux, sans le lire", async () => {
    const { target, emit } = setupClaude([]);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    const init = { method: 'POST', body, duplex: 'half' } as RequestInit;
    // L'appel d'origine lit son flux : il ne doit pas avoir été pris.
    await expect(target.fetch(PERFORM, init)).resolves.toBeInstanceOf(Response);
    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledExactlyOnceWith({
        rejection: { site: 'claude_ai', reason: 'format' },
      }),
    );
  });

  it('continue de lire le flux quand une émission lève', async () => {
    const stream = pagedStream();
    const emit = vi.fn().mockImplementationOnce(() => {
      throw new Error('postMessage impossible');
    });
    const { target } = setupClaude([timelineResponse(stream.body)], emit);
    await target.fetch(TIMELINE, timelineInit);
    const Y = {
      ...X,
      userId: X.userId.replace('b001', 'b003'),
      replyId: X.replyId.replace('b002', 'b004'),
    };
    for (const one of [X, Y]) {
      await target.fetch(PERFORM, {
        method: 'POST',
        body: sendBody({ userId: one.userId, replyId: one.replyId, text: one.userText }),
      });
      for (const part of await exchangeEnvelopes(one)) stream.push(part);
    }
    await vi.waitFor(() => expect(emit).toHaveBeenCalledTimes(2));
    expect(emit).toHaveBeenLastCalledWith({
      exchange: {
        ...captured,
        user: { ...captured.user, messageId: Y.userId },
        assistant: { ...captured.assistant, messageId: Y.replyId },
      },
    });
  });

  it("annule la copie d'un flux que l'analyseur ne lit pas, et rejette s'il attend un envoi", async () => {
    const cancel = vi.spyOn(ReadableStream.prototype, 'cancel');
    const stream = pagedStream();
    const { target, emit } = setupClaude([timelineResponse(stream.body, 'application/json')]);
    await target.fetch(PERFORM, await sendInit());
    await settle(); // l'envoi est lu (et ouvert) avant que le flux ne réponde
    const page = await target.fetch(TIMELINE, timelineInit);
    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledExactlyOnceWith({
        rejection: { site: 'claude_ai', reason: 'format' },
      }),
    );
    // La copie seule est annulée : sinon elle garderait en file tout le flux que la page lit.
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
    stream.push(envelope(heartbeat(1)));
    const reader = page.body?.getReader();
    if (!reader) throw new Error('pas de corps');
    expect(await readBytes(reader, 11)).toEqual(envelope(heartbeat(1)));
    cancel.mockRestore();
  });

  it('émet l’échange quand la page prend le lecteur de son corps dès la réponse reçue', async () => {
    const stream = pagedStream();
    const { target, emit } = setupClaude([timelineResponse(stream.body)]);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    // Comme connect-web : le corps est verrouillé dans la suite immédiate de fetch.
    await target.fetch(TIMELINE, timelineInit).then((response) => {
      reader = response.body?.getReader();
    });
    if (!reader) throw new Error('pas de corps');
    const page = reader;
    void (async () => {
      while (!(await page.read()).done) {}
    })();
    await target.fetch(PERFORM, await sendInit());
    for (const one of await exchangeEnvelopes(X)) stream.push(one);
    await vi.waitFor(() => expect(emit).toHaveBeenCalledExactlyOnceWith({ exchange: captured }));
  });

  it('ne copie pas la réponse d’un PerformAction sans texte arrivée après la fin de l’observation', async () => {
    const clone = vi.spyOn(Response.prototype, 'clone');
    const target = {
      fetch: (async () => {
        await settle();
        return new Response(proto([6, 4]), { headers: { 'content-type': 'application/proto' } });
      }) as typeof fetch,
    };
    installFetchInterceptor(target, [createClaudeAiParser()], vi.fn());
    const response = await target.fetch(PERFORM, { method: 'POST', body: smallActionBody() });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(proto([6, 4]));
    expect(clone).not.toHaveBeenCalled();
    clone.mockRestore();
  });

  it.each([
    ['répond 500', () => new Response('', { status: 500 }), 'reçue'],
    ['échoue', () => Promise.reject(new TypeError('Failed to fetch')), 'rejetée'],
  ])(
    'oublie l’envoi dont l’appel %s : aucun rejet 15 minutes plus tard',
    async (_label, perform, outcome) => {
      let clock = NOW;
      const stream = pagedStream();
      const original = vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('/PerformAction') ? perform() : timelineResponse(stream.body),
      );
      const target = { fetch: original as typeof fetch };
      const emit = vi.fn();
      installFetchInterceptor(target, [createClaudeAiParser(() => clock)], emit);
      // La page reçoit la réponse ou le rejet d'origine.
      const page = await target.fetch(PERFORM, await sendInit()).then(
        () => 'reçue',
        () => 'rejetée',
      );
      expect(page).toBe(outcome);
      await settle();
      clock = new Date(NOW.getTime() + 16 * 60_000);
      await target.fetch(TIMELINE, timelineInit);
      stream.push(envelope(heartbeat(1)));
      await settle();
      expect(emit).not.toHaveBeenCalled();
    },
  );

  it('ne dit rien d’un StreamTimeline en erreur quand un envoi attend', async () => {
    const failed = new Response('{"code":"unavailable"}', {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
    const { target, emit } = setupClaude([failed]);
    await target.fetch(PERFORM, await sendInit());
    await settle();
    await target.fetch(TIMELINE, timelineInit);
    await settle();
    expect(emit).not.toHaveBeenCalled();
  });

  it("rend à la page la promesse d'origine elle-même, que l'appel soit suivi ou non", async () => {
    for (const [href, init] of [
      [TIMELINE, timelineInit],
      [PERFORM, await sendInit()],
      [CHATGPT, { method: 'POST', body: '{}' }],
      ['https://claude.ai/api/autre', { method: 'POST' }],
    ] as const) {
      const pending = Promise.resolve(new Response('{}'));
      const target = { fetch: (() => pending) as typeof fetch };
      installFetchInterceptor(target, [createClaudeAiParser(), chatgptParser], vi.fn());
      expect(target.fetch(href, init)).toBe(pending);
    }
  });

  it('ne casse pas la page quand un analyseur au fil de l’eau lève', async () => {
    const throwing: StreamParser[] = [
      {
        site: 'claude_ai',
        matchesRequest: () => true,
        observe: () => {
          throw new Error('format inconnu');
        },
      },
      {
        site: 'claude_ai',
        matchesRequest: () => true,
        observe: async () => Promise.reject(new Error('x')),
      },
    ];
    for (const parser of throwing) {
      const sent = new Response('ok');
      const target = { fetch: (async () => sent) as typeof fetch };
      installFetchInterceptor(target, [parser], vi.fn());
      const response = await target.fetch(TIMELINE, timelineInit);
      expect(response).toBe(sent);
      expect(await response.text()).toBe('ok');
    }
    await settle();
  });
});
