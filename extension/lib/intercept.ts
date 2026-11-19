import type { CaptureMessage, RejectReason } from './exchange';
import type { SiteParser } from './parsers/site-parser';

type FetchInput = Parameters<typeof fetch>[0];
type Capture = { parser: SiteParser; url: URL; requestBody: Promise<string | null> };

// Au-delà, on arrête de lire et l'échange est rejeté comme incomplet (l'échange ChatGPT relevé le 19/11/2026 faisait
// 8 240 caractères).
export const STREAM_MAX_CHARS = 5_000_000;

// Le corps d'un objet Request est cloné tout de suite : l'appel d'origine va le consommer.
function readRequestBody(input: FetchInput, init: RequestInit | undefined): Promise<string | null> {
  if (init?.body != null) return Promise.resolve(typeof init.body === 'string' ? init.body : null);
  if (input instanceof Request) return input.clone().text();
  return Promise.resolve(null);
}

function prepareCapture(
  input: FetchInput,
  init: RequestInit | undefined,
  parsers: readonly SiteParser[],
): Capture | null {
  const href = input instanceof Request ? input.url : String(input);
  const url = new URL(href, globalThis.location?.href);
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const parser = parsers.find((candidate) => candidate.matchesRequest(url, method));
  if (!parser) return null;
  const requestBody = readRequestBody(input, init).catch(() => null);
  return { parser, url, requestBody };
}

// Lit le flux morceau par morceau et garde ce qui est arrivé : ChatGPT annule son appel dès la fin du flux, et une
// lecture par text() est alors rejetée sans rien rendre. null : flux plus gros que la borne.
async function readStream(body: ReadableStream<Uint8Array> | null): Promise<string | null> {
  if (body === null) return '';
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      text += decoder.decode(chunk.value, { stream: true });
      if (text.length > STREAM_MAX_CHARS) {
        // Annuler la copie seule : la page garde son flux.
        reader.cancel().catch(() => {});
        return null;
      }
    }
  } catch {
    // Annulation ou coupure : l'analyseur dira si ce qui est arrivé forme un échange complet.
  }
  return text + decoder.decode();
}

function observe(
  response: Response,
  capture: Capture,
  emit: (message: CaptureMessage) => void,
  now: () => Date,
): void {
  // Le site a refusé : rien à capter, rien à dire.
  if (!response.ok) return;
  const reject = (reason: RejectReason) =>
    emit({ rejection: { site: capture.parser.site, reason } });
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    reject('format');
    return;
  }
  // Clone pris avant de rendre la réponse : la page lit l'original, on lit la copie à côté.
  const copy = response.clone();
  // La page n'attend jamais l'observation : un parseur qui lève ou un emit qui échoue sont ignorés.
  void Promise.all([readStream(copy.body), capture.requestBody])
    .then(async ([sseText, requestBody]) => {
      if (sseText === null) return reject('incomplet');
      const result = await capture.parser.parse({
        url: capture.url,
        requestBody,
        sseText,
        now: now(),
      });
      if (result === null) return;
      if ('rejected' in result) reject(result.rejected);
      else emit({ exchange: result });
    })
    .catch(() => {});
}

// Remplace target.fetch (monde MAIN de la page) ; la page reçoit toujours la réponse d'origine, ou son rejet.
export function installFetchInterceptor(
  target: { fetch: typeof fetch },
  parsers: SiteParser[],
  emit: (message: CaptureMessage) => void,
  now: () => Date = () => new Date(),
): void {
  const originalFetch = target.fetch;
  target.fetch = async (input, init) => {
    let capture: Capture | null = null;
    try {
      capture = prepareCapture(input, init, parsers);
    } catch {
      // URL illisible ou parseur qui lève : la requête part sans capture.
    }
    const response = await originalFetch.call(target, input, init);
    try {
      if (capture) observe(response, capture, emit, now);
    } catch {
      // Réponse inattendue (clone impossible) ou emit qui lève : la page la reçoit sans capture.
    }
    return response;
  };
}
