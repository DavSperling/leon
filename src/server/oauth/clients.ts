import { createHash } from 'node:crypto';
import { z } from 'zod';
import { signPayload, verifyPayload } from '@/server/auth/computer-code';
import { type DocumentReadOptions, readClientDocument, refuseDocument } from './client-document';

// Les clients OAuth des assistants (L4, L5, L10 et L11 du plan « MCP distant ») : qui peut s'inscrire, vers quelles
// adresses de retour, et comment relire un client_id.

const PURPOSE = 'oauth-client';
const NAME_MAX_CHARS = 80;
const NAME_FALLBACK = 'MCP client';
const URI_MAX_CHARS = 512;
const URIS_MAX = 5;

// L11. Les adresses de retour que chaque client publie dans sa documentation, pas ses hôtes : un autre chemin du même
// hôte (une redirection ouverte, l'adresse de retour d'un autre service) ne reçoit jamais de code. « Exactement » :
// schéma, hôte, port (443) et chemin, sans requête ni fragment, comparés caractère par caractère.
// Une adresse de plus, c'est une ligne ici, recopiée de la documentation du client, et son essai réel (M07).
const FIXED_REDIRECTS = [
  'https://claude.ai/api/mcp/auth_callback', // Claude (claude.ai, Desktop, mobile)
  'https://chatgpt.com/connector_platform_oauth_redirect', // ChatGPT
  'https://www.cursor.com/agents/mcp/oauth/callback', // Cursor (web)
  'https://vscode.dev/redirect', // VS Code (web)
  'https://insiders.vscode.dev/redirect', // VS Code (web, Insiders) : VS Code bureau inscrit les deux
  'https://antigravity.google/oauth-callback', // Antigravity
];
const CHATGPT_CONNECTOR = /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,128}$/;
// Claude Code, Codex, Cursor, VS Code, Gemini CLI (bureau) : http://127.0.0.1[:<port>]/<chemin>, ou localhost.
export const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);
// Les hôtes dont un document CIMD est lu (L10) sont ceux de la table : jamais un autre.
const DOCUMENT_HOSTS = new Set(FIXED_REDIRECTS.map((uri) => new URL(uri).hostname));

// L'adresse sous sa forme canonique : l'URL normalisée redonne exactement la chaîne reçue (ni majuscules, ni port par
// défaut, ni « .. », ni tabulation ou « \ » que l'analyse corrige), sans identifiant ni fragment. Ce que Leon compare
// et affiche est alors ce que le navigateur suivra.
function parse(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.href === value && !url.username && !url.password && !value.includes('#')
      ? url
      : null;
  } catch {
    return null;
  }
}

// Le bouclage : http seulement, hôte 127.0.0.1 ou localhost, un chemin quelconque, un port facultatif (la forme
// canonique refuse le port par défaut écrit, « :80 »).
function loopback(value: string): URL | null {
  const url = parse(value);
  return url?.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname) ? url : null;
}

const redirectPermitted = (uri: string) =>
  uri.length <= URI_MAX_CHARS &&
  (FIXED_REDIRECTS.includes(uri) || CHATGPT_CONNECTOR.test(uri) || loopback(uri) !== null);

const permittedUris = (uris: string[]) =>
  uris.length >= 1 && uris.length <= URIS_MAX && uris.every(redirectPermitted);

// L6 : l'adresse demandée est l'une des adresses du client, caractère par caractère ; pour le bouclage, la même au
// port près (RFC 8252 §7.3).
const withoutPort = (url: URL) => {
  const copy = new URL(url);
  copy.port = '';
  return copy.href;
};

export function redirectAllowed(clientUris: string[], uri: string): boolean {
  const requested = loopback(uri);
  return clientUris.some((registered) => {
    if (registered === uri) return true;
    const known = loopback(registered);
    return !!known && !!requested && withoutPort(known) === withoutPort(requested);
  });
}

// Sans caractères de contrôle ni de mise en forme (une inversion du sens d'écriture ferait lire un autre nom), coupé
// à 80 caractères (des points de code, pas des unités UTF-16) ; vide, absent ou autre chose qu'un texte : « MCP client ».
function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return NAME_FALLBACK;
  const name = [...raw.replace(/[\p{Cc}\p{Cf}]/gu, '').trim()].slice(0, NAME_MAX_CHARS).join('');
  return name.trim() || NAME_FALLBACK;
}

// L'empreinte d'un client_id : ClientInfo.ref, le « c » du code d'autorisation (L7) et le client_ref de la ligne de
// l'assistant (L9). Sa seule source : un renouvellement la calcule sans lire le client.
export const clientRef = (clientId: string) => createHash('sha256').update(clientId).digest('hex');

export type ClientInfo = {
  name: string;
  redirectUris: string[];
  host: string; // l'hôte de la première adresse de retour, 127.0.0.1 pour le bouclage : le seul élément vérifié
  ref: string; // SHA-256 du client_id (L7 « c », L9 client_ref)
};

// L'hôte d'une adresse de retour permise par L11 : 127.0.0.1 pour le bouclage. Celui qu'une ligne d'assistant garde
// (client_host), pris à l'adresse où le code est parti.
export const returnHost = (uri: string) => (loopback(uri) ? '127.0.0.1' : new URL(uri).hostname);

// `uris` est non vide et permise par L11 (permittedUris).
function describeClient(clientId: string, name: string, uris: string[]): ClientInfo {
  const [first = ''] = uris;
  return { name, redirectUris: uris, host: returnHost(first), ref: clientRef(clientId) };
}

const RegistrationSchema = z.looseObject({
  redirect_uris: z.unknown().optional(),
  client_name: z.unknown().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
});
const UrisSchema = z.array(z.string());

type Registration = {
  client_id: string;
  client_id_issued_at: number;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: 'none';
};

// L4 : l'inscription ne stocke rien. Les autres champs de RFC 7591 sont acceptés et ignorés ; un
// token_endpoint_auth_method autre que « none » reçoit « none » (F4 : RFC 7591 §3.2.1 permet de remplacer une valeur).
export function registerClient(
  input: unknown,
): { client: Registration } | { error: 'invalid_client_metadata' | 'invalid_redirect_uri' } {
  const metadata = RegistrationSchema.safeParse(input);
  if (!metadata.success) return { error: 'invalid_client_metadata' };
  const { grant_types, response_types } = metadata.data;
  if (grant_types && !grant_types.includes('authorization_code'))
    return { error: 'invalid_client_metadata' };
  if (response_types && (response_types.length === 0 || response_types.some((t) => t !== 'code')))
    return { error: 'invalid_client_metadata' };
  const uris = UrisSchema.safeParse(metadata.data.redirect_uris);
  if (!uris.success || !permittedUris(uris.data)) return { error: 'invalid_redirect_uri' };

  const name = cleanName(metadata.data.client_name);
  const issuedAt = Math.floor(Date.now() / 1000);
  // L5. shortcut: un client_id ne se révoque pas (rien n'est stocké) ; les jetons, si. Une table oauth_clients le jour
  // où il faudra bannir un client.
  const clientId = signPayload(PURPOSE, { v: 1, n: name, r: uris.data, i: issuedAt });
  return {
    client: {
      client_id: clientId,
      client_id_issued_at: issuedAt,
      client_name: name,
      redirect_uris: uris.data,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
  };
}

const ClientIdSchema = z.strictObject({
  v: z.literal(1),
  n: z.string(),
  r: z.array(z.string()),
  i: z.number().int(),
});

// Lire un client_id inscrit, c'est le vérifier. Les adresses sont revérifiées contre L11 : une adresse retirée de la
// table cesse de valoir, même signée.
function readRegistered(value: string): ClientInfo | null {
  const payload = ClientIdSchema.safeParse(verifyPayload(PURPOSE, value));
  if (!payload.success || !permittedUris(payload.data.r)) return null;
  return describeClient(value, payload.data.n, payload.data.r);
}

const DocumentSchema = z.looseObject({
  client_id: z.string(),
  client_name: z.string(),
  redirect_uris: z.array(z.string()),
});

// https, l'un des hôtes de L11, port 443, un chemin, ni requête ni fragment ni identifiant.
function documentUrl(value: string): boolean {
  const url = parse(value);
  return (
    !!url &&
    value.length <= URI_MAX_CHARS &&
    url.protocol === 'https:' &&
    DOCUMENT_HOSTS.has(url.hostname) &&
    url.port === '' &&
    url.pathname !== '/' &&
    !value.includes('?')
  );
}

// Le jugement du document, rendu une seule fois à la lecture et gardé tel quel par le cache : un refus n'y reste pas plus
// d'une minute et ne se recompte pas. Un token_endpoint_auth_method du document, quel qu'il soit, est ignoré : le
// client est public (F4).
function judgeDocument(url: string, raw: unknown): ClientInfo | null {
  const document = DocumentSchema.safeParse(raw);
  if (
    !document.success ||
    document.data.client_id !== url ||
    !permittedUris(document.data.redirect_uris)
  )
    return refuseDocument('document');
  return describeClient(url, cleanName(document.data.client_name), document.data.redirect_uris);
}

// L10.
async function readDocument(
  url: string,
  options?: DocumentReadOptions,
): Promise<ClientInfo | null> {
  if (!documentUrl(url)) return refuseDocument('address');
  return readClientDocument(url, (raw) => judgeDocument(url, raw), options);
}

// L'adresse d'un document (L10) plutôt qu'un client_id signé (L5) : le lire est un appel réseau. Le seul critère, pour
// que la page d'autorisation sache à l'avance si lire le client coûte un appel.
export const isDocumentClientId = (value: string) => value.startsWith('https://');

// Un client_id signé (L5) ou l'adresse d'un document (L10) ; sinon null. Asynchrone : CIMD lit un document.
// Les `options` servent aux tests (un faux fetch, un faux cache, l'heure).
export async function readClientId(
  value: string,
  options?: DocumentReadOptions,
): Promise<ClientInfo | null> {
  return isDocumentClientId(value) ? readDocument(value, options) : readRegistered(value);
}

// Leon sert-il encore ce client_id ? Le jugement local de readClientId, sans réseau : un client inscrit, par sa signature
// et ses adresses de retour encore permises par L11 ; une adresse de document, par sa forme et son hôte encore dans L11,
// sans lire le document (ni compter un refus : rien n'est refusé ici, c'est l'appelant qui juge). Au renouvellement, il
// retire leurs jetons aux clients que L11 ne sert plus.
export function clientStillAllowed(value: string): boolean {
  return isDocumentClientId(value) ? documentUrl(value) : readRegistered(value) !== null;
}
