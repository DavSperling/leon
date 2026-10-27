import type { z } from 'zod';
import type { ProviderId } from '@/capture/turn';
import { PROVIDER_LABELS } from '@/lib/providers';

// Le seul client HTTP des connecteurs. Il fixe les hôtes, les délais et les limites, et ne laisse
// passer dans ses erreurs ni le corps de la réponse, ni l'adresse complète (la requête peut porter
// une clé), ni un en-tête.

export type HttpRequest = {
  url: string; // https://<hôte autorisé>/… ; peut déjà porter une chaîne de requête
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  // Ajoutée à celle de url ; un tableau répète le paramètre.
  query?: Record<string, string | number | boolean | string[] | undefined>;
  body?: unknown; // envoyé en JSON
  form?: Record<string, string>; // envoyé en application/x-www-form-urlencoded ; jamais avec body
  raw?: { type: string; text: string }; // envoyé tel quel (le lot multipart de Gmail) ; seul corps
  // Ex. [400] : le corps est validé par le schéma et rendu au connecteur au lieu de lever.
  acceptStatus?: number[];
};

export type ConnectorHttp = {
  json<T>(request: HttpRequest, schema: z.ZodType<T>): Promise<T>;
  // Pagination par l'en-tête Link.
  page<T>(request: HttpRequest, schema: z.ZodType<T>): Promise<{ data: T; nextUrl: string | null }>;
  // Une réponse qui n'est pas du JSON (export de Drive, lot de Gmail), avec son type et son code.
  text(request: HttpRequest): Promise<{ text: string; type: string | null; status: number }>;
};

// Message fixe : jamais celui de l'outil.
export class ConnectorAuthError extends Error {
  override name = 'ConnectorAuthError';
  constructor(
    providerLabel: string,
    readonly status: number | null = null,
  ) {
    super(`${providerLabel} rejected the key`);
  }
}

export class ConnectorHttpError extends Error {
  override name = 'ConnectorHttpError';
  constructor(
    readonly status: number | null,
    message: string,
  ) {
    super(message);
  }
}

// Une réponse au-delà de BODY_MAX_BYTES : l'appelant peut laisser de côté ce qu'il demandait.
export class ResponseTooBigError extends ConnectorHttpError {
  override name = 'ResponseTooBigError';
}

// Google signale ses limites (userRateLimitExceeded, rateLimitExceeded, dailyLimitExceeded) par un 403
// sans Retry-After : seule la raison, dans le corps, les distingue d'un accès retiré.
export const GOOGLE_RATE_LIMIT = /ratelimitexceeded|dailylimitexceeded/i;

// Connecté, mais l'outil n'ouvre rien à Leon (appli installée sur aucun dépôt, aucune base, aucun
// projet) : l'utilisateur doit choisir chez l'outil ce que Leon peut lire.
export class NothingToReadError extends Error {
  override name = 'NothingToReadError';
}

const TIMEOUT_MS = 30_000;
const BODY_MAX_BYTES = 10 * 1024 * 1024;
const RETRIES_MAX = 3;
const WAIT_MAX_MS = 60_000;
const BACKOFF_MS = 2000; // puis 4 et 8 secondes

type Answer = { status: number; headers: Headers; text: string };
type Prepared = { url: string; headers: Headers; body: string | undefined };
type Attempt =
  | { kind: 'done'; answer: Answer }
  | { kind: 'retry'; waitMs: number; failure: ConnectorHttpError };

function retryAfterMs(value: string): number | null {
  const text = value.trim();
  const ms = /^\d+$/.test(text) ? Number(text) * 1000 : Date.parse(text) - Date.now();
  return Number.isFinite(ms) ? Math.max(0, ms) : null;
}

// Retry-After (secondes ou date), sinon x-ratelimit-reset (secondes depuis 1970), sinon 2, 4, 8 s.
function waitBeforeRetry(headers: Headers, number: number): number {
  const backoff = BACKOFF_MS * 2 ** number;
  const retryAfter = headers.get('retry-after');
  const untilReset = Number(headers.get('x-ratelimit-reset')) * 1000 - Date.now();
  let waitMs = backoff;
  if (retryAfter !== null) waitMs = retryAfterMs(retryAfter) ?? backoff;
  else if (untilReset > 0) waitMs = untilReset;
  return Math.min(waitMs, WAIT_MAX_MS);
}

// GitHub signale une limite dépassée par un 403 qui porte Retry-After ou x-ratelimit-remaining: 0,
// Google par la raison écrite dans le corps.
function isRateLimit(status: number, headers: Headers, body: string): boolean {
  if (status === 429) return true;
  const signal = headers.has('retry-after') || headers.get('x-ratelimit-remaining') === '0';
  return status === 403 && (signal || GOOGLE_RATE_LIMIT.test(body));
}

// Lit le flux et s'arrête dès que la limite est dépassée.
async function readBody(response: Response): Promise<string> {
  const tooBig = new ResponseTooBigError(response.status, 'Response too large');
  if (Number(response.headers.get('content-length')) > BODY_MAX_BYTES) throw tooBig;
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > BODY_MAX_BYTES) {
      await reader.cancel().catch(() => {});
      throw tooBig;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// « Link: <url>; rel="next"; results="false" » : l'adresse suivante, ou null s'il n'y en a pas.
function nextLink(header: string | null, base: string, status: number): string | null {
  if (header === null) return null;
  for (const [, target, params = ''] of header.matchAll(/<([^>]*)>([^<]*)/g)) {
    const rel = /;\s*rel="?([^";,]*)"?/i.exec(params)?.[1] ?? '';
    if (target === undefined || !rel.toLowerCase().split(/\s+/).includes('next')) continue;
    if (/;\s*results="?false"?/i.test(params)) return null;
    try {
      return new URL(target, base).toString();
    } catch {
      throw new ConnectorHttpError(status, 'Unexpected response');
    }
  }
  return null;
}

export function createConnectorHttp(input: {
  provider: ProviderId;
  hosts: string[];
  minIntervalMs?: number;
  fetchImpl?: typeof fetch; // tests
  sleep?: (ms: number) => Promise<void>; // tests
}): ConnectorHttp {
  const label = PROVIDER_LABELS[input.provider];
  const hosts = input.hosts.map((host) => host.toLowerCase());
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  let nextSlotAt = Number.NEGATIVE_INFINITY;

  // Réserve le créneau avant d'attendre : deux appels simultanés ne se chevauchent pas.
  async function pace(): Promise<void> {
    if (!input.minIntervalMs) return;
    const slot = Math.max(Date.now(), nextSlotAt);
    nextSlotAt = slot + input.minIntervalMs;
    if (slot > Date.now()) await sleep(slot - Date.now());
  }

  function buildUrl(request: HttpRequest): string {
    const refused = new ConnectorHttpError(null, 'Address not allowed');
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      throw refused;
    }
    // host inclut le port : un port explicite est refusé avec le reste.
    if (url.protocol !== 'https:' || !hosts.includes(url.host) || url.username || url.password) {
      throw refused;
    }
    for (const [name, value] of Object.entries(request.query ?? {})) {
      if (value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) {
        url.searchParams.append(name, String(item));
      }
    }
    return url.toString();
  }

  // Les en-têtes portent la clé de l'utilisateur. Quand Node refuse une valeur (retour à la ligne,
  // caractère hors Latin-1), son erreur cite la valeur entière : elle n'est jamais reprise.
  function buildHeaders(request: HttpRequest): Headers {
    try {
      const headers = new Headers({ accept: 'application/json' });
      if (request.body !== undefined) headers.set('content-type', 'application/json');
      if (request.form !== undefined) {
        headers.set('content-type', 'application/x-www-form-urlencoded');
      }
      if (request.raw !== undefined) headers.set('content-type', request.raw.type);
      for (const [name, value] of Object.entries(request.headers ?? {})) headers.set(name, value);
      return headers;
    } catch {
      throw new ConnectorHttpError(null, `Invalid header: check your ${label} key`);
    }
  }

  function buildBody(request: HttpRequest): string | undefined {
    const given = [request.body, request.form, request.raw].filter((part) => part !== undefined);
    if (given.length > 1) throw new ConnectorHttpError(null, 'Invalid request');
    if (request.raw !== undefined) return request.raw.text;
    if (request.form !== undefined) return new URLSearchParams(request.form).toString();
    if (request.body === undefined) return undefined;
    try {
      return JSON.stringify(request.body);
    } catch {
      throw new ConnectorHttpError(null, `Invalid request body for ${label}`);
    }
  }

  // Les codes d'erreur : reprise (limite de débit, 5xx), clé refusée, ou erreur définitive.
  function failure(status: number, headers: Headers, number: number, body: string): Attempt {
    const retry = (message: string): Attempt => ({
      kind: 'retry',
      waitMs: waitBeforeRetry(headers, number),
      failure: new ConnectorHttpError(status, message),
    });
    if (isRateLimit(status, headers, body)) return retry(`${label} rate limit reached`);
    if (status >= 500) return retry(`${label} responded with ${status}`);
    if (status === 401 || status === 403) throw new ConnectorAuthError(label, status);
    throw new ConnectorHttpError(status, `${label} responded with ${status}`);
  }

  async function attempt(
    request: HttpRequest,
    { url, headers, body }: Prepared,
    number: number,
  ): Promise<Attempt> {
    // Erreur réseau ou délai dépassé : le message de l'erreur d'origine n'est jamais repris.
    const unreachable = (): Attempt => ({
      kind: 'retry',
      waitMs: BACKOFF_MS * 2 ** number,
      failure: new ConnectorHttpError(null, `${label} is unreachable`),
    });
    await pace();
    try {
      const response = await (input.fetchImpl ?? fetch)(url, {
        method: request.method ?? 'GET',
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const { status } = response;
      if (!request.acceptStatus?.includes(status) && !(status >= 200 && status < 300)) {
        // Le corps d'un 403 dit s'il s'agit d'une limite (Google) ; les autres ne sont pas lus.
        const body = status === 403 ? await readBody(response).catch(() => '') : '';
        if (status !== 403) await response.body?.cancel().catch(() => {});
        return failure(status, response.headers, number, body);
      }
      return {
        kind: 'done',
        answer: { status, headers: response.headers, text: await readBody(response) },
      };
    } catch (error) {
      if (error instanceof ConnectorHttpError || error instanceof ConnectorAuthError) throw error;
      return unreachable();
    }
  }

  async function receive(request: HttpRequest): Promise<Answer & { url: string }> {
    // Une requête inutilisable échoue ici, avant toute reprise.
    const url = buildUrl(request);
    const prepared = { url, headers: buildHeaders(request), body: buildBody(request) };
    for (let number = 0; ; number++) {
      const result = await attempt(request, prepared, number);
      if (result.kind === 'done') return { ...result.answer, url };
      if (number >= RETRIES_MAX) throw result.failure;
      await sleep(result.waitMs);
    }
  }

  async function send<T>(request: HttpRequest, schema: z.ZodType<T>) {
    const { status, headers, text, url } = await receive(request);
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new ConnectorHttpError(status, 'Unreadable response');
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new ConnectorHttpError(status, 'Unexpected response');
    return { data: parsed.data, headers, url, status };
  }

  return {
    async json(request, schema) {
      return (await send(request, schema)).data;
    },
    async page(request, schema) {
      const { data, headers, url, status } = await send(request, schema);
      return { data, nextUrl: nextLink(headers.get('link'), url, status) };
    },
    async text(request) {
      const { text, headers, status } = await receive(request);
      return { text, type: headers.get('content-type'), status };
    },
  };
}
