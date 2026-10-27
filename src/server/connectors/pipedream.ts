import { z } from 'zod';
import type { ProviderId } from '@/capture/turn';
import { logError } from '@/server/log';
import { type ConnectorHttp, ConnectorHttpError, createConnectorHttp } from './http';
import type { AnyConnector } from './types';

// Pipedream Connect : son appli OAuth, déjà validée chez Google et Slack, et son proxy. Leon garde un
// utilisateur Pipedream par personne (`externalUserId`) et, par connexion, le compte branché
// (`accountId`) ; les jetons de l'outil restent chez Pipedream, qui les ajoute aux requêtes.
// Étude et essai réel : docs/etudes/pipedream-2026-10. Doc lue le 25/10/2026 :
//   https://pipedream.com/docs/connect/api-proxy (adresse en base64url, 30 s au plus, en-têtes restreints)
//   https://pipedream.com/docs/connect/api-reference/create-connect-token (success_redirect_uri…)
//   https://pipedream.com/docs/connect/api-reference/list-accounts-for-external-user
//   https://pipedream.com/pricing (chaque utilisateur distinct est facturé, quel que soit son nombre de comptes)
//   https://pipedream.com/docs/rest-api/auth (jeton serveur par client_credentials, valable 1 h)
// Chaque requête au proxy coûte 1 crédit (vérifié : un lot Gmail de 100 mails = 1 crédit).

const API = 'https://api.pipedream.com';
const TIMEOUT_MS = 30_000;
const TOKEN_MARGIN_MS = 60_000;
const CLOCK_MARGIN_MS = 60_000; // l'horloge de Pipedream contre la nôtre

// Les champs chiffrés d'une connexion Pipedream : le compte branché ne sert qu'avec nos identifiants
// Pipedream, mais il ouvre la boîte mail : il ne reste pas lisible en base.
export const PIPEDREAM_SECRET_FIELDS = ['accountId'] as const;

export const PipedreamConfigSchema = z.object({
  authMode: z.literal('pipedream'),
  externalUserId: z.string().min(1).max(100),
  accountId: z.string().regex(/^apn_[A-Za-z0-9]+$/),
});
export type PipedreamConfig = z.infer<typeof PipedreamConfigSchema>;

export type PipedreamEnv = {
  projectId: string;
  clientId: string;
  clientSecret: string;
  environment: 'development' | 'production';
};

// Lues à chaque appel, pour que les tests les simulent. Le mode développement (gratuit, 10 comptes de
// test, l'utilisateur doit être connecté à pipedream.com) sauf PIPEDREAM_ENVIRONMENT=production, qui
// demande l'offre payante : on ne bascule pas sans le dire.
export function pipedreamEnv(): PipedreamEnv | null {
  const projectId = process.env.PIPEDREAM_PROJECT_ID;
  const clientId = process.env.PIPEDREAM_CLIENT_ID;
  const clientSecret = process.env.PIPEDREAM_CLIENT_SECRET;
  if (!projectId || !clientId || !clientSecret) return null;
  const environment =
    process.env.PIPEDREAM_ENVIRONMENT === 'production' ? 'production' : 'development';
  return { projectId, clientId, clientSecret, environment };
}

// Message fixe : jamais le corps d'une réponse de Pipedream.
const unavailable = (status: number | null = null) =>
  new ConnectorHttpError(status, 'Pipedream injoignable');

type Fetch = typeof fetch;

async function call(fetchImpl: Fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw unavailable();
  }
}

const TokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
});
let cachedToken: { clientId: string; token: string; expiresAt: number } | null = null;

// Le jeton serveur de Pipedream, gardé jusqu'à une minute de sa fin. `fresh` : en redemander un.
async function serverToken(env: PipedreamEnv, fetchImpl: Fetch, fresh = false): Promise<string> {
  const now = Date.now();
  if (!fresh && cachedToken?.clientId === env.clientId && cachedToken.expiresAt > now)
    return cachedToken.token;
  const response = await call(fetchImpl, `${API}/v1/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: env.clientId,
      client_secret: env.clientSecret,
    }),
  });
  if (!response.ok) throw unavailable(response.status);
  const parsed = TokenSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw unavailable(response.status);
  const lifetimeMs = (parsed.data.expires_in ?? 3600) * 1000;
  cachedToken = {
    clientId: env.clientId,
    token: parsed.data.access_token,
    expiresAt: now + lifetimeMs - TOKEN_MARGIN_MS,
  };
  return cachedToken.token;
}

// Tests seulement.
export function forgetPipedreamToken(): void {
  cachedToken = null;
}

async function api(
  env: PipedreamEnv,
  fetchImpl: Fetch,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${await serverToken(env, fetchImpl)}`,
    'x-pd-environment': env.environment,
  };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return call(fetchImpl, `${API}/v1/connect/${encodeURIComponent(env.projectId)}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

const LinkSchema = z.object({ connect_link_url: z.url() });

// Le lien Pipedream où l'utilisateur branche son compte (valable 10 minutes, comme le cookie du
// déroulé), limité à l'appli de l'outil ; Pipedream renvoie ensuite à `successUri` ou `errorUri`.
export async function createConnectLink(
  env: PipedreamEnv,
  input: { externalUserId: string; app: string; successUri: string; errorUri: string },
  fetchImpl: Fetch = fetch,
): Promise<string> {
  const response = await api(env, fetchImpl, '/tokens', {
    method: 'POST',
    body: {
      external_user_id: input.externalUserId,
      app_id: input.app,
      expires_in: 600,
      success_redirect_uri: input.successUri,
      error_redirect_uri: input.errorUri,
    },
  });
  if (!response.ok) throw unavailable(response.status);
  const parsed = LinkSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw unavailable(response.status);
  const link = new URL(parsed.data.connect_link_url);
  link.searchParams.set('app', input.app);
  return link.toString();
}

const AccountsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      healthy: z.boolean().nullish(),
      dead: z.boolean().nullish(),
      created_at: z.string().nullish(),
      updated_at: z.string().nullish(),
      authorized_scopes: z.array(z.string()).nullish(),
      app: z.object({ name_slug: z.string() }).nullish(),
    }),
  ),
});

// `fresh` : créé pendant ce branchement, donc encore utilisé par aucune connexion.
export type PipedreamAccount = { id: string; scopes: string[] | null; fresh: boolean };

const time = (value: string | null | undefined) => Date.parse(value ?? '') || 0;

// Le compte de l'appli que la personne vient de brancher, s'il est sain : le dernier créé depuis
// `startedAt`, sinon le dernier mis à jour (un compte déjà branché, autorisé à nouveau ; la date bouge
// aussi quand Pipedream renouvelle un jeton, d'où la préférence pour un compte neuf). La liste filtrée
// par utilisateur : `/users/{id}/accounts` rend un tableau nu et un 404 pour un inconnu (essai du 25/10).
export async function findAccount(
  env: PipedreamEnv,
  externalUserId: string,
  app: string,
  startedAt: number,
  fetchImpl: Fetch = fetch,
): Promise<PipedreamAccount | null> {
  const query = new URLSearchParams({ external_user_id: externalUserId, app });
  const response = await api(env, fetchImpl, `/accounts?${query}`);
  if (!response.ok) throw unavailable(response.status);
  const parsed = AccountsSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw unavailable(response.status);
  const usable = parsed.data.data
    .filter((account) => !account.dead && account.healthy !== false)
    .filter((account) => !account.app || account.app.name_slug === app);
  const created = usable
    .filter((account) => time(account.created_at) >= startedAt - CLOCK_MARGIN_MS)
    .sort((a, b) => time(b.created_at) - time(a.created_at));
  const updated = usable.sort((a, b) => time(b.updated_at) - time(a.updated_at));
  const account = created[0] ?? updated[0];
  if (!account) return null;
  return {
    id: account.id,
    scopes: account.authorized_scopes ?? null,
    fresh: account === created[0],
  };
}

// Retire un compte : Pipedream oublie ses jetons. L'utilisateur, celui de la personne, peut en porter
// d'autres. Déjà absent : rien à faire (DELETE /accounts/{id} rend 204, essai du 25/10).
export async function deleteAccount(
  env: PipedreamEnv,
  accountId: string,
  fetchImpl: Fetch = fetch,
): Promise<void> {
  const path = `/accounts/${encodeURIComponent(accountId)}`;
  const response = await api(env, fetchImpl, path, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) throw unavailable(response.status);
}

// Après une suppression, une reconnexion ou un échec : le compte n'a plus d'usage. Pipedream
// injoignable n'empêche rien (journalisé) : le compte reste chez lui, sans connexion qui s'en serve.
// shortcut: restent aussi chez Pipedream les comptes d'un retour jamais revenu (cookie expiré, deux
// onglets), ceux d'un membre ou d'un espace supprimé (cascade SQL), et les utilisateurs restés sans
// compte ; un balayage périodique des comptes et utilisateurs sans connexion, avant la production.
export async function forgetPipedreamAccount(
  accountId: unknown,
  fetchImpl: Fetch = fetch,
): Promise<void> {
  const env = pipedreamEnv();
  if (!env || typeof accountId !== 'string' || accountId === '') return;
  try {
    await deleteAccount(env, accountId, fetchImpl);
  } catch (error) {
    logError('connector.pipedream_cleanup_failed', error);
  }
}

// Un `fetch` qui passe par le proxy : la requête du connecteur (adresse de l'outil, déjà contrôlée par le
// client HTTP) part chez Pipedream, qui y ajoute l'accès du compte. Un 401 peut venir d'un jeton
// Pipedream périmé plus tôt que prévu : un seul nouvel essai avec un jeton neuf, puis le refus remonte.
export function proxyFetch(env: PipedreamEnv, config: PipedreamConfig, baseFetch: Fetch): Fetch {
  return async (input, init) => {
    const target = Buffer.from(String(input)).toString('base64url');
    const query = new URLSearchParams({
      external_user_id: config.externalUserId,
      account_id: config.accountId,
    });
    const url = `${API}/v1/connect/${encodeURIComponent(env.projectId)}/proxy/${target}?${query}`;
    const send = async (fresh: boolean) => {
      const headers = new Headers(init?.headers);
      headers.delete('authorization'); // l'accès à l'outil, c'est Pipedream qui le met
      headers.set('authorization', `Bearer ${await serverToken(env, baseFetch, fresh)}`);
      headers.set('x-pd-environment', env.environment);
      return baseFetch(url, { ...init, headers });
    };
    const response = await send(false);
    if (response.status !== 401) return response;
    await response.body?.cancel().catch(() => {});
    return send(true);
  };
}

// Le client HTTP d'un connecteur : direct, ou par le proxy quand la connexion est une connexion Pipedream.
// Pipedream non configuré sur ce serveur : chaque requête échoue avec un message à nous.
export function connectorHttp(
  provider: ProviderId,
  connector: AnyConnector,
  config: Record<string, unknown>,
  deps: { fetchImpl?: Fetch; sleep?: (ms: number) => Promise<void> } = {},
): ConnectorHttp {
  let fetchImpl = deps.fetchImpl;
  if (config.authMode === 'pipedream') {
    const env = pipedreamEnv();
    const parsed = PipedreamConfigSchema.safeParse(config);
    fetchImpl =
      env && parsed.success
        ? proxyFetch(env, parsed.data, deps.fetchImpl ?? fetch)
        : async () => {
            throw new ConnectorHttpError(null, 'Pipedream n’est pas configuré sur ce serveur');
          };
  }
  return createConnectorHttp({
    provider,
    hosts: connector.hosts(config),
    minIntervalMs: connector.minIntervalMs,
    fetchImpl,
    sleep: deps.sleep,
  });
}
