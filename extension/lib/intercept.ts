import type { CapturedExchange } from './exchange';
import type { SiteParser } from './parsers/site-parser';

type FetchInput = Parameters<typeof fetch>[0];
type Capture = { parser: SiteParser; url: URL; requestBody: Promise<string | null> };

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

function observe(
  response: Response,
  capture: Capture,
  emit: (exchange: CapturedExchange) => void,
  now: () => Date,
): void {
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok || !contentType.includes('text/event-stream')) return;
  // Clone pris avant de rendre la réponse : la page lit l'original, on lit la copie à côté.
  const copy = response.clone();
  // La page n'attend jamais l'observation : flux coupé, parseur qui lève ou emit qui échoue sont ignorés.
  void Promise.all([copy.text(), capture.requestBody])
    .then(([sseText, requestBody]) =>
      capture.parser.parse({ url: capture.url, requestBody, sseText, now: now() }),
    )
    .then((exchange) => {
      if (exchange) emit(exchange);
    })
    .catch(() => {});
}

// Remplace target.fetch (monde MAIN de la page) ; la page reçoit toujours la réponse d'origine, ou son rejet.
export function installFetchInterceptor(
  target: { fetch: typeof fetch },
  parsers: SiteParser[],
  emit: (exchange: CapturedExchange) => void,
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
      // Réponse inattendue (clone impossible) : la page la reçoit sans capture.
    }
    return response;
  };
}
