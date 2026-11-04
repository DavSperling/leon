import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { signPayload, verifyPayload } from '@/server/auth/computer-code';
import type { TenantContext } from '@/server/auth/tenant-context';
import type { DocumentReadOptions } from './client-document';
import { type ClientInfo, LOOPBACK_HOSTS, readClientId, redirectAllowed } from './clients';
import { AUTHORIZE_PATH, ISSUER, OAUTH_SCOPE, RESOURCE } from './metadata';

// La page d'autorisation (L6) et le code qu'elle signe (L7) du plan « MCP distant ». Une demande n'est valide que
// lue ici, qu'elle vienne de l'adresse de la page, du formulaire de l'action ou du retour après la connexion : une
// seule règle, partout. Le serveur ne suit jamais une adresse qu'il n'a pas comparée à celles du client.

export const OAUTH_PARAMS = [
  'response_type',
  'client_id',
  'redirect_uri',
  'state',
  'code_challenge',
  'code_challenge_method',
  'scope',
  'resource',
] as const;

const CLIENT_ID_MAX = 4096; // 4 Ko : un client_id d'inscription porte un nom et jusqu'à 5 adresses (L4)
const VALUE_MAX = 512; // redirect_uri (L11), state (L6) ; borne de forme des autres valeurs au retour de la connexion
const CODE_TTL_SECONDS = 120;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/; // SHA-256 en base64url, sans remplissage

export type AuthorizeError =
  | 'unsupported_response_type'
  | 'invalid_request'
  | 'invalid_scope'
  | 'invalid_target';
// Où renvoyer une erreur ou un refus : une adresse déjà comparée à celles du client, et l'état s'il est valable.
export type ReturnTarget = { redirectUri: string; state?: string };
export type AuthorizeRequest = {
  client: ClientInfo; // partagé avec le cache des documents : à lire, jamais à modifier
  clientId: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  host: string; // l'hôte de redirectUri : là où part le code, ce que la page montre
  loopback: boolean;
};
// Page d'erreur sans rien suivre ('client', 'retour') ; erreur renvoyée à redirect_uri ; ou la demande validée.
export type ParsedAuthorize =
  | { erreur: 'client' | 'retour' }
  | { erreur: AuthorizeError; retour: ReturnTarget }
  | AuthorizeRequest;

// undefined : absent ; null : présent mais pas une seule chaîne (paramètre répété, fichier de formulaire…).
function one(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : null;
}

// Les `options` ne servent qu'aux tests (un faux fetch pour un document CIMD).
export async function parseAuthorizeRequest(
  raw: Record<string, unknown>,
  options?: DocumentReadOptions,
): Promise<ParsedAuthorize> {
  // L6 point 1, sans rien coûter d'abord : la forme de client_id et de redirect_uri, avant de lire un document.
  const clientId = one(raw.client_id);
  if (!clientId || clientId.length > CLIENT_ID_MAX) return { erreur: 'client' };
  const asked = one(raw.redirect_uri);
  if (asked === null || (asked?.length ?? 0) > VALUE_MAX) return { erreur: 'retour' };

  const client = await readClientId(clientId, options);
  if (!client) return { erreur: 'client' };
  const redirectUri =
    asked ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
  if (!redirectUri || !redirectAllowed(client.redirectUris, redirectUri))
    return { erreur: 'retour' };

  // L6 point 2 : l'adresse est vérifiée, toute erreur y retourne avec l'état (s'il est valable).
  const state = one(raw.state);
  const retour: ReturnTarget = {
    redirectUri,
    state: typeof state === 'string' && state.length <= VALUE_MAX ? state : undefined,
  };
  const fail = (erreur: AuthorizeError) => ({ erreur, retour });

  const type = one(raw.response_type);
  if (type !== 'code')
    return fail(type === undefined ? 'invalid_request' : 'unsupported_response_type');
  const codeChallenge = one(raw.code_challenge);
  if (!codeChallenge || !CHALLENGE.test(codeChallenge) || one(raw.code_challenge_method) !== 'S256')
    return fail('invalid_request');
  if (state === null || (state?.length ?? 0) > VALUE_MAX) return fail('invalid_request');
  const scope = one(raw.scope);
  if (scope !== undefined && scope !== '' && scope !== OAUTH_SCOPE) return fail('invalid_scope');
  const resource = one(raw.resource);
  if (resource !== undefined && resource !== RESOURCE) return fail('invalid_target');

  const { hostname } = new URL(redirectUri);
  return {
    client,
    clientId,
    redirectUri,
    state: retour.state,
    codeChallenge,
    host: hostname,
    loopback: LOOPBACK_HOSTS.has(hostname),
  };
}

// Les huit paramètres de la demande validée, tels que la page les rend : ce qui était implicite (adresse de retour,
// périmètre, ressource) est écrit. L'ordre est celui de OAUTH_PARAMS, donc le chemin rebâti est toujours le même.
export const oauthFields = (request: AuthorizeRequest): Record<string, string> => ({
  response_type: 'code',
  client_id: request.clientId,
  redirect_uri: request.redirectUri,
  ...(request.state === undefined ? {} : { state: request.state }),
  code_challenge: request.codeChallenge,
  code_challenge_method: 'S256',
  scope: OAUTH_SCOPE,
  resource: RESOURCE,
});

export const oauthAuthorizePath = (request: AuthorizeRequest) =>
  `${AUTHORIZE_PATH}?${new URLSearchParams(oauthFields(request))}`;

// Le chemin de la page pour le retour après la connexion, sur la forme seulement : le chemin fixe, les huit paramètres
// connus, chacun une chaîne bornée, rebâtis ; le reste de `raw` est écarté. Il ne lit pas le client (pas de réseau, et
// connexion et pathAfterSignIn restent synchrones) : la page, elle, revalide tout à chaque affichage. null : pas une demande.
export function oauthReturnPath(raw: Record<string, unknown>): string | null {
  const kept = new URLSearchParams();
  for (const name of OAUTH_PARAMS) {
    const value = one(raw[name]);
    if (value === undefined) continue;
    if (value === null || value.length > (name === 'client_id' ? CLIENT_ID_MAX : VALUE_MAX))
      return null;
    kept.set(name, value);
  }
  return kept.get('client_id') ? `${AUTHORIZE_PATH}?${kept}` : null;
}

const CODE_PURPOSE = 'oauth-code';
// L7. `x` est obligatoire : verifyPayload ne vérifie l'expiration que d'une charge qui en porte une, c'est ce schéma
// qui refuse un code sans expiration. M06 le lit par readAuthorizationCode.
const CodeSchema = z.strictObject({
  v: z.literal(1),
  j: z.string().regex(/^[A-Za-z0-9_-]{22}$/), // 16 octets aléatoires : le grant_id, unique en base
  c: z.string().regex(/^[0-9a-f]{64}$/), // SHA-256 du client_id (ClientInfo.ref)
  r: z.string().min(1), // redirect_uri exacte
  p: z.string().regex(CHALLENGE), // code_challenge reçu
  u: z.string().min(1),
  t: z.string().min(1),
  x: z.number().int(), // expiration, secondes depuis 1970
});
export type AuthorizationCode = z.infer<typeof CodeSchema>;

// null : signature fausse ou d'un autre but, expiré, ou charge qui n'est pas celle de L7. L'appelant ne dit pas lequel.
export function readAuthorizationCode(
  code: string,
  options: { now?: number } = {},
): AuthorizationCode | null {
  const parsed = CodeSchema.safeParse(verifyPayload(CODE_PURPOSE, code, options));
  return parsed.success ? parsed.data : null;
}

// Les paramètres s'ajoutent à ceux que redirect_uri porte déjà, par URL et searchParams, jamais par concaténation.
// `iss` accompagne toute réponse au client (ChatGPT et Codex refusent un retour qui n'en a pas).
function returnUrl(redirectUri: string, params: Record<string, string | undefined>): string {
  const url = new URL(redirectUri);
  for (const [name, value] of Object.entries({ ...params, iss: ISSUER }))
    if (value !== undefined) url.searchParams.append(name, value);
  return url.toString();
}

// « Autoriser » : signe le code pour l'utilisateur et l'espace de la session, et rend l'adresse de retour.
export function codeRedirect(
  request: AuthorizeRequest,
  { userId, tenantId }: Pick<TenantContext, 'userId' | 'tenantId'>,
  now = Date.now(),
): string {
  const payload: AuthorizationCode = {
    v: 1,
    j: randomBytes(16).toString('base64url'),
    c: request.client.ref,
    r: request.redirectUri,
    p: request.codeChallenge,
    u: userId,
    t: tenantId,
    x: Math.floor(now / 1000) + CODE_TTL_SECONDS,
  };
  return returnUrl(request.redirectUri, {
    code: signPayload(CODE_PURPOSE, payload),
    state: request.state,
  });
}

// « Refuser » (access_denied) et les erreurs de L6 point 2.
export const errorRedirect = (
  { redirectUri, state }: ReturnTarget,
  error: AuthorizeError | 'access_denied',
) => returnUrl(redirectUri, { error, state });
