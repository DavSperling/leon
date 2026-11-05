// La lecture du document d'un client (CIMD, L10 du plan « MCP distant ») : un GET sur l'adresse du client_id, et la
// mémoire qui évite de le refaire. Elle ne juge pas l'adresse : l'appelant (clients.ts) ne l'appelle que pour un hôte
// de L11, en https, port 443, avec un chemin. Il juge le contenu par `validate`, appelé une fois à la lecture : le cache
// garde le résultat jugé, un refus n'y reste donc pas plus d'une minute.
// Sans en-tête ni cookie, sans suivre de redirection, 5 s et 16 Ko au plus. Tout échec rend null.

const TIMEOUT_MS = 5000;
const MAX_BYTES = 16 * 1024;
const MAX_TTL_SECONDS = 60 * 60; // une heure au plus, quoi que dise Cache-Control
const DEFAULT_TTL_SECONDS = 60; // sans max-age, et pour un échec
const MAX_ENTRIES = 100;

type CacheEntry = { result: unknown; expires: number };
export type DocumentCache = Map<string, CacheEntry>;

// shortcut: mémoire du processus (chaque instance relit pour elle-même), 100 adresses au plus, la plus ancienne sortie
// la première ; une table partagée le jour où il y aura plusieurs instances à ménager.
const CACHE: DocumentCache = new Map();
// Les lectures en cours, par adresse : deux demandes en même temps pour la même adresse font une seule requête sortante.
const PENDING = new Map<string, Promise<unknown>>();

// L'injection ne sert qu'aux tests : un faux fetch, un faux cache, l'heure, une durée courte. Par défaut, le vrai.
export type DocumentReadOptions = {
  fetch?: typeof fetch;
  cache?: DocumentCache;
  now?: number;
  timeoutMs?: number;
};

// Un « compteur » (L10) : une ligne par refus, avec la raison seule. Jamais l'adresse, le nom ni le contenu.
export function refuseDocument(reason: string): null {
  console.warn('[leon]', 'oauth.client_document_refused', JSON.stringify({ reason }));
  return null;
}

// Les octets de la réponse, ou null s'ils dépassent 16 Ko : on coupe la lecture au-delà, sans tout garder en mémoire.
async function readCapped(response: Response): Promise<Buffer | null> {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) {
    await response.body?.cancel();
    return null;
  }
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// Le JSON lu (pas encore jugé) et sa durée de garde en secondes ; null pour un échec, déjà compté.
async function download(
  url: string,
  fetchDocument: typeof fetch,
  timeoutMs: number,
): Promise<{ document: unknown; ttl: number } | null> {
  const failure = (reason: string) => refuseDocument(reason);
  try {
    const response = await fetchDocument(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return failure('status');
    }
    const body = await readCapped(response);
    if (body === null) return failure('size');
    let document: unknown;
    try {
      document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    } catch {
      return failure('format');
    }
    const cacheControl = response.headers.get('cache-control') ?? '';
    const maxAge = /max-age=(\d+)/i.exec(cacheControl)?.[1];
    const ttl = /no-store|no-cache/i.test(cacheControl)
      ? 0
      : Math.min(maxAge === undefined ? DEFAULT_TTL_SECONDS : Number(maxAge), MAX_TTL_SECONDS);
    return { document, ttl };
  } catch {
    // Réseau, redirection, 5 s dépassées : ni le message ni le nom de l'erreur, ils peuvent citer l'adresse.
    return failure('unreachable');
  }
}

// Un refus (result null) n'évince jamais un document accepté : une adresse qui varie ne chasse pas ChatGPT de la mémoire.
// Au plafond, le plus ancien refus part d'abord ; sans refus, le plus ancien document, sauf devant un refus, qui n'est
// alors pas gardé.
function remember(cache: DocumentCache, url: string, entry: CacheEntry): void {
  cache.delete(url);
  if (cache.size >= MAX_ENTRIES) {
    const refused = [...cache].find(([, kept]) => kept.result === null)?.[0];
    const victim = refused ?? (entry.result === null ? undefined : cache.keys().next().value);
    if (victim === undefined) return;
    cache.delete(victim);
  }
  cache.set(url, entry);
}

// null : lecture impossible ou document refusé par `validate`, une minute en mémoire au plus.
export async function readClientDocument<T>(
  url: string,
  validate: (document: unknown) => T | null,
  {
    fetch: fetchDocument = fetch,
    cache = CACHE,
    now = Date.now(),
    timeoutMs = TIMEOUT_MS,
  }: DocumentReadOptions = {},
): Promise<T | null> {
  const cached = cache.get(url);
  if (cached && cached.expires > now) return cached.result as T | null;
  const pending = PENDING.get(url);
  if (pending) return pending as Promise<T | null>;

  const read = async (): Promise<T | null> => {
    const downloaded = await download(url, fetchDocument, timeoutMs);
    const result = downloaded === null ? null : validate(downloaded.document);
    const ttl = downloaded === null || result === null ? DEFAULT_TTL_SECONDS : downloaded.ttl;
    if (ttl > 0) remember(cache, url, { result, expires: now + ttl * 1000 });
    return result;
  };
  const reading = read().finally(() => PENDING.delete(url));
  PENDING.set(url, reading);
  return reading;
}
