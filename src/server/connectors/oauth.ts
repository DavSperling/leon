import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ProviderId } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { env } from '@/server/env';
import { type LoadedConnection, saveOAuthTokens } from './connections';
import { type ConnectorHttp, ConnectorHttpError, createConnectorHttp } from './http';
import type { OAuthPending } from './oauth-cookie';
import { oauthClient } from './oauth-env';
import type { AnyConnector, OAuthSpec, OAuthTokens } from './types';

// Le déroulé OAuth « code d'autorisation » : adresse d'autorisation, échange du code, renouvellement.
// Les jetons vivent dans le bloc secret chiffré de la connexion, comme une clé.

// Les deux jetons rejoignent `secretFields` du connecteur pour le chiffrement (`accessToken` d'abord :
// `secret_hint` vient du premier champ). Un connecteur ne les met jamais dans son propre `secretFields`.
export const OAUTH_SECRET_FIELDS = ['accessToken', 'refreshToken'] as const;

const RENEW_BEFORE_MS = 5 * 60_000;
const NOT_JETON_FIELDS = ['access_token', 'refresh_token', 'id_token'];

// Le message est fixe : jamais le texte de l'éditeur. `adminConsent` : refus faute d'accord de
// l'administrateur (Microsoft), que l'interface explique à part.
export class OAuthRefusedError extends Error {
  override name = 'OAuthRefusedError';
  constructor(readonly adminConsent = false) {
    super("Autorisation refusée par l'éditeur");
  }
}

// Une seule adresse de retour par appli : Jira et Confluence partagent `atlassian`.
export function redirectUri(spec: OAuthSpec): string {
  const path = `/api/v1/connexions/oauth/${spec.appKey.toLowerCase()}/retour`;
  return new URL(path, env.BETTER_AUTH_URL).toString();
}

export function authorizeUrl(
  spec: OAuthSpec,
  client: { id: string },
  pending: OAuthPending,
): string {
  const url = new URL(spec.authorizeUrl);
  const params: Record<string, string> = {
    client_id: client.id,
    redirect_uri: redirectUri(spec),
    response_type: 'code',
    state: pending.state,
  };
  if (spec.scopes.length > 0) params.scope = spec.scopes.join(spec.scopeSeparator ?? ' ');
  if (spec.pkce && pending.verifier !== null) {
    params.code_challenge = createHash('sha256').update(pending.verifier).digest('base64url');
    params.code_challenge_method = 'S256';
  }
  for (const [name, value] of Object.entries({ ...params, ...spec.extraAuthorizeParams })) {
    url.searchParams.set(name, value);
  }
  return url.toString();
}

// `error` signe le refus (RFC 6749, § 5.2), quel que soit le statut : GitHub répond en 200.
const TokenResponseSchema = z.looseObject({
  access_token: z.string().min(1).nullish(),
  refresh_token: z.string().min(1).nullish(),
  expires_in: z.number().nullish(),
  scope: z.string().nullish(),
  error: z.unknown().optional(),
  error_description: z.string().nullish(),
});
type TokenResponse = z.infer<typeof TokenResponseSchema>;

type Client = { id: string; secret: string };

// Le client des échanges de jetons : un seul hôte, celui de l'adresse de jeton.
export const tokenHttp = (spec: OAuthSpec, provider: ProviderId, fetchImpl?: typeof fetch) =>
  createConnectorHttp({ provider, hosts: [new URL(spec.tokenUrl).host], fetchImpl });

async function requestTokens(
  spec: OAuthSpec,
  client: Client,
  grant: Record<string, string>,
  http: ConnectorHttp,
): Promise<TokenResponse & { access_token: string }> {
  const basic = spec.clientAuth === 'basic';
  const params = basic ? grant : { ...grant, client_id: client.id, client_secret: client.secret };
  const authorization = `Basic ${Buffer.from(`${client.id}:${client.secret}`).toString('base64')}`;
  const mode = spec.tokenBody ?? 'form';
  const data = await http.json(
    {
      url: spec.tokenUrl,
      method: 'POST',
      headers: basic ? { authorization } : undefined,
      acceptStatus: [400, 401, 403],
      ...(mode === 'form'
        ? { form: params }
        : mode === 'json'
          ? { body: params }
          : { query: params }),
    },
    TokenResponseSchema,
  );
  if (data.error !== undefined && data.error !== null && data.error !== '') {
    const error = typeof data.error === 'string' ? data.error : 'erreur';
    const consent = spec.adminConsent?.isConsentError({
      error,
      description: data.error_description ?? null,
    });
    throw new OAuthRefusedError(consent ?? false);
  }
  if (!data.access_token) throw new ConnectorHttpError(null, 'Réponse inattendue');
  return { ...data, access_token: data.access_token };
}

function toTokens(
  data: TokenResponse & { access_token: string },
  previous: string | null,
): OAuthTokens {
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? previous,
    expiresAt: expiresAt?.toISOString() ?? null,
    scope: data.scope ?? null,
    raw: Object.fromEntries(
      Object.entries(data).filter(([name]) => !NOT_JETON_FIELDS.includes(name)),
    ),
  };
}

// `http` : `tokenHttp`, construit par l'appelant.
export async function exchangeCode(
  spec: OAuthSpec,
  client: Client,
  code: string,
  verifier: string | null,
  http: ConnectorHttp,
): Promise<OAuthTokens> {
  const grant: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(spec),
    ...(spec.pkce && verifier !== null ? { code_verifier: verifier } : {}),
    ...spec.extraTokenParams?.code,
  };
  return toTokens(await requestTokens(spec, client, grant, http), null);
}

// Sans `refresh_token` dans la réponse, l'ancien reste valable (Asana).
export async function refreshTokens(
  spec: OAuthSpec,
  client: Client,
  refreshToken: string,
  http: ConnectorHttp,
): Promise<OAuthTokens> {
  const grant = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    ...spec.extraTokenParams?.refresh,
  };
  return toTokens(await requestTokens(spec, client, grant, http), refreshToken);
}

const isString = (value: unknown): value is string => typeof value === 'string' && value !== '';

// Avant chaque passage : sur une connexion OAuth, renouvelle l'accès s'il expire dans moins de
// 5 minutes (ou si `force`) et enregistre les nouveaux jetons AVANT de rendre la config : un éditeur
// qui n'accepte un jeton de rafraîchissement qu'une fois ne doit pas le perdre si le passage plante.
// `expiresAt` nul (Notion, ClickUp…) : jamais renouvelé, sauf `force` (accès refusé en cours de passage).
export async function ensureFreshTokens(
  ctx: TenantContext,
  connection: LoadedConnection,
  connector: AnyConnector,
  deps: { fetchImpl?: typeof fetch; now?: () => Date; force?: boolean },
): Promise<Record<string, unknown>> {
  const { config } = connection;
  const { oauth } = connector;
  if (!oauth || config.authMode !== 'oauth') return config;
  const now = (deps.now ?? (() => new Date()))().getTime();
  const expiresAt = isString(config.expiresAt) ? Date.parse(config.expiresAt) : null;
  if (!deps.force && (expiresAt === null || expiresAt - now > RENEW_BEFORE_MS)) return config;

  const client = oauthClient(oauth.appKey);
  if (!isString(config.refreshToken) || !client) throw new OAuthRefusedError();
  const http = tokenHttp(oauth, connection.provider, deps.fetchImpl);
  const tokens = await refreshTokens(oauth, client, config.refreshToken, http);
  const renewed = {
    ...config,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  };
  const secretFields = [...OAUTH_SECRET_FIELDS, ...connector.secretFields];
  await saveOAuthTokens(ctx, connection.id, renewed, secretFields, { reconnect: false });
  return renewed;
}
