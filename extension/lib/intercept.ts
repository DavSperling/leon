import type { CapturedExchange, CaptureMessage } from './exchange';
import type { Rejection, SiteParser, StreamParser } from './parsers/site-parser';

type FetchInput = Parameters<typeof fetch>[0];
type Capture = { parser: SiteParser; url: URL; requestBody: Promise<string | null> };
type Report = (result: CapturedExchange | Rejection) => void;
// Ce qu'il faut faire de la réponse d'un appel reconnu, une fois l'appel d'origine parti.
type Watch = (response: Promise<Response>) => void;

// Au-delà, on arrête de lire et l'échange est rejeté comme incomplet (l'échange ChatGPT relevé le 19/11/2026 faisait
// 8 240 caractères).
export const STREAM_MAX_CHARS = 5_000_000;

// Le corps d'un objet Request est cloné tout de suite : l'appel d'origine va le consommer.
function readRequestBody(input: FetchInput, init: RequestInit | undefined): Promise<string | null> {
  if (init?.body != null) return Promise.resolve(typeof init.body === 'string' ? init.body : null);
  if (input instanceof Request) return input.clone().text();
  return Promise.resolve(null);
}

// En octets, pour un analyseur au fil de l'eau ; copiés tout de suite. Un corps en flux n'est pas lu : le lire le
// prendrait à la page.
function readRequestBytes(
  input: FetchInput,
  init: RequestInit | undefined,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const body = init?.body;
  if (body instanceof ReadableStream) return Promise.resolve(null);
  if (body != null) return new Response(body).bytes();
  if (input instanceof Request) return input.clone().bytes();
  return Promise.resolve(null);
}

// Les morceaux de la copie, un par un : une annulation ou une coupure finit la suite sans lever. Sortir de la boucle
// annule la copie seule : la page garde son flux.
async function* chunksOf(body: ReadableStream<Uint8Array> | null): AsyncGenerator<Uint8Array> {
  if (body === null) return;
  const reader = body.getReader();
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      yield chunk.value;
    }
  } catch {
    // Annulation ou coupure : l'analyseur dira si ce qui est arrivé forme un échange complet.
  } finally {
    reader.cancel().catch(() => {});
  }
}

// Lit le flux morceau par morceau et garde ce qui est arrivé : ChatGPT annule son appel dès la fin du flux, et une
// lecture par text() est alors rejetée sans rien rendre. null : flux plus gros que la borne.
async function readStream(body: ReadableStream<Uint8Array> | null): Promise<string | null> {
  const decoder = new TextDecoder();
  let text = '';
  for await (const chunk of chunksOf(body)) {
    text += decoder.decode(chunk, { stream: true });
    // Sortir de la boucle annule la copie : sinon elle garderait en file tout ce que la page lit encore.
    if (text.length > STREAM_MAX_CHARS) return null;
  }
  return text + decoder.decode();
}

function observe(response: Response, capture: Capture, report: Report, now: () => Date): void {
  // Le site a refusé : rien à capter, rien à dire.
  if (!response.ok) return;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    report({ rejected: 'format' });
    return;
  }
  // Clone pris avant de rendre la réponse : la page lit l'original, on lit la copie à côté.
  const copy = response.clone();
  // La page n'attend jamais l'observation : un parseur qui lève est ignoré.
  void Promise.all([readStream(copy.body), capture.requestBody])
    .then(async ([sseText, requestBody]) => {
      if (sseText === null) return report({ rejected: 'incomplet' });
      const result = await capture.parser.parse({
        url: capture.url,
        requestBody,
        sseText,
        now: now(),
      });
      if (result !== null) report(result);
    })
    .catch(() => {});
}

// Un analyseur au fil de l'eau suit l'appel dès l'envoi et lit la copie de la réponse à son rythme. Quand il a fini,
// la copie qu'il n'a pas lue est annulée : sinon elle garderait en file tout le flux, peut-être sans fin, que la
// page lit.
function watchStream(
  parser: StreamParser,
  input: FetchInput,
  init: RequestInit | undefined,
  url: URL,
  report: Report,
): Watch {
  const request = {
    headers: new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)),
    body: readRequestBytes(input, init).catch(() => null),
  };
  return (pending) => {
    let copy: Response | null = null;
    const response = pending
      .then((original) => {
        if (!original.ok) return null;
        copy = original.clone();
        return { headers: original.headers, chunks: chunksOf(copy.body) };
      })
      .catch(() => null);
    void parser
      .observe({ url, request, response, report })
      .catch(() => {})
      .finally(() => copy?.body?.cancel().catch(() => {}));
  };
}

function prepareCapture(
  input: FetchInput,
  init: RequestInit | undefined,
  parsers: readonly (SiteParser | StreamParser)[],
  emit: (message: CaptureMessage) => void,
  now: () => Date,
): Watch | null {
  const href = input instanceof Request ? input.url : String(input);
  const url = new URL(href, globalThis.location?.href);
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const parser = parsers.find((candidate) => candidate.matchesRequest(url, method));
  if (!parser) return null;
  // Un emit qui échoue est ignoré : ni la page ni l'analyseur n'en savent rien.
  const report: Report = (result) => {
    try {
      emit(
        'rejected' in result
          ? { rejection: { site: parser.site, reason: result.rejected } }
          : { exchange: result },
      );
    } catch {}
  };
  if ('observe' in parser) return watchStream(parser, input, init, url, report);
  const capture = { parser, url, requestBody: readRequestBody(input, init).catch(() => null) };
  return (pending) => {
    void pending.then((response) => observe(response, capture, report, now)).catch(() => {});
  };
}

// Remplace target.fetch (monde MAIN de la page). La page reçoit la promesse d'origine elle-même : jamais retardée ni
// changée ; l'observation se greffe à côté, et rien de ce qu'elle fait ne remonte à la page.
export function installFetchInterceptor(
  target: { fetch: typeof fetch },
  parsers: readonly (SiteParser | StreamParser)[],
  emit: (message: CaptureMessage) => void,
  now: () => Date = () => new Date(),
): void {
  const originalFetch = target.fetch;
  target.fetch = (input, init) => {
    let watch: Watch | null = null;
    try {
      watch = prepareCapture(input, init, parsers, emit, now);
    } catch {
      // URL illisible ou parseur qui lève : la requête part sans capture.
    }
    const response = originalFetch.call(target, input, init);
    try {
      // Greffé avant que la page ne reçoive la promesse : la copie est prise avant qu'elle ne lise le corps.
      watch?.(response);
    } catch {
      // Analyseur qui lève : la page reçoit sa réponse sans capture.
    }
    return response;
  };
}
