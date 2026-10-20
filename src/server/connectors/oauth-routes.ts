import { randomBytes, timingSafeEqual } from 'node:crypto';
import { type Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { csrf } from 'hono/csrf';
import { z } from 'zod';
import { PROVIDER_IDS, type ProviderId } from '@/capture/turn';
import { DEFAULT_SINCE, fieldsFromForm, SINCE_VALUES } from '@/lib/connection-form';
import { PROVIDER_LABELS } from '@/lib/providers';
import { auth } from '@/server/auth/auth';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { env } from '@/server/env';
import { logError } from '@/server/log';
import { accountLabel } from './account-label';
import { listCatalog } from './catalog';
import { createConnection, listConnections, saveOAuthTokens } from './connections';
import { connectorsKey } from './crypto';
import {
  ConnectorAuthError,
  type ConnectorHttp,
  ConnectorHttpError,
  createConnectorHttp,
} from './http';
import { withoutOtherSites } from './jira/access';
import {
  authorizeUrl,
  exchangeCode,
  OAUTH_SECRET_FIELDS,
  OAuthRefusedError,
  tokenHttp,
} from './oauth';
import {
  OAUTH_COOKIE,
  OAUTH_COOKIE_MAX_AGE,
  OAUTH_COOKIE_PATH,
  type OAuthPending,
  openPending,
  sealPending,
} from './oauth-cookie';
import { oauthClient } from './oauth-env';
import type { AnyConnector, OAuthSpec } from './types';

// Les deux routes du bouton « Se connecter avec… » : `POST /:outil/debut` envoie chez l'éditeur,
// `GET /:appli/retour` termine le branchement. Rien de ce que dit l'éditeur ne finit dans une
// adresse, un message ou un journal : seulement un code de la table ci-dessous.

export type OAuthRoutesDeps = {
  getConnector: (id: ProviderId) => AnyConnector | null;
  fetchImpl?: typeof fetch; // tests
  now?: () => number; // tests
};

type ReturnCode =
  | 'annule'
  | 'expire'
  | 'refuse'
  | 'indisponible'
  | 'champs'
  | 'admin'
  | 'admin_accorde'
  | 'autre_compte';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOT_FOUND = { error: 'Introuvable' };

const connexions = (params: Record<string, string>) =>
  `/connexions?${new URLSearchParams(params).toString()}`;

// Comparaison en temps constant, longueurs d'abord.
function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Jamais getUserContext : il lit `next/headers`, qui lève hors d'une requête Next.
async function sessionContext(c: Context): Promise<TenantContext | null> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return null;
  return resolveTenantContext(session.user.id, session.session.activeOrganizationId ?? null);
}

const asProviderId = (value: string | undefined): ProviderId | null =>
  PROVIDER_IDS.find((id) => id === value) ?? null;

function stringValues(body: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of Object.entries(body))
    if (typeof value === 'string') values[name] = value;
  return values;
}

// Les champs non secrets demandés avant le clic, validés par le schéma de l'outil. `.shape` et non
// `.pick` : le schéma d'un outil à bouton est raffiné, et `.pick` lève sur un schéma raffiné.
function preFieldsFromForm(
  provider: ProviderId,
  connector: AnyConnector,
  spec: OAuthSpec,
  values: Record<string, string>,
): Record<string, unknown> | null {
  const catalog = listCatalog().find((entry) => entry.id === provider)?.fields ?? [];
  const fields = catalog.filter((field) => spec.preFields.includes(field.name));
  const shape = (connector.configSchema as unknown as z.ZodObject).shape;
  const schema = z.object(Object.fromEntries(spec.preFields.map((name) => [name, shape[name]])));
  const parsed = schema.safeParse(fieldsFromForm(fields, values));
  return parsed.success ? parsed.data : null;
}

type Start = { preFields: Record<string, unknown>; reconnectId: string | null };

// « Reconnecter » : la connexion doit exister, être de cet outil, avoir été branchée par l'utilisateur
// (un administrateur y mettrait son propre compte), et ses champs ouverts servent de champs avant le clic. Sinon les champs viennent du formulaire. null : champs refusés.
async function startFields(
  ctx: TenantContext,
  provider: ProviderId,
  connector: AnyConnector,
  spec: OAuthSpec,
  values: Record<string, string>,
): Promise<Start | null | 'absent'> {
  if (!values.reconnect) {
    const preFields = preFieldsFromForm(provider, connector, spec, values);
    return preFields && { preFields, reconnectId: null };
  }
  const id = z.uuid().safeParse(values.reconnect);
  const stored = id.success
    ? (await listConnections(ctx)).find((view) => view.id === id.data && view.provider === provider)
    : undefined;
  if (!stored?.isCreator) return 'absent';
  const kept = spec.preFields.filter((name) => name in stored.config);
  return {
    preFields: Object.fromEntries(kept.map((name) => [name, stored.config[name]])),
    reconnectId: stored.id,
  };
}

async function startHandler(c: Context, deps: OAuthRoutesDeps): Promise<Response> {
  const provider = asProviderId(c.req.param('provider'));
  const connector = provider && deps.getConnector(provider);
  const spec = connector ? connector.oauth : undefined;
  const client = spec && oauthClient(spec.appKey);
  if (!provider || !connector || !spec || !client) return c.json(NOT_FOUND, 404);
  const ctx = await sessionContext(c);
  if (!ctx) return c.redirect('/connexion', 303);
  if (!connectorsKey())
    return c.redirect(connexions({ erreur: 'indisponible', outil: provider }), 303);

  const values = stringValues(await c.req.parseBody());
  const since = z.enum(SINCE_VALUES).safeParse(values.since || DEFAULT_SINCE);
  const start = await startFields(ctx, provider, connector, spec, values);
  if (start === 'absent') return c.json(NOT_FOUND, 404);
  if (!start || !since.success)
    return c.redirect(connexions({ erreur: 'champs', outil: provider }), 303);

  const pending: OAuthPending = {
    provider,
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    state: randomBytes(24).toString('base64url'),
    verifier: spec.pkce ? randomBytes(32).toString('base64url') : null,
    since: since.data,
    ...start,
    createdAt: (deps.now ?? Date.now)(),
  };
  setCookie(c, OAUTH_COOKIE, sealPending(pending), {
    httpOnly: true,
    sameSite: 'Lax',
    secure: new URL(env.BETTER_AUTH_URL).protocol === 'https:',
    path: OAUTH_COOKIE_PATH,
    maxAge: OAUTH_COOKIE_MAX_AGE,
  });
  return c.redirect(authorizeUrl(spec, client, pending), 303);
}

// L'échange du code, puis la configuration de l'outil (jetons compris), validée par son schéma.
async function oauthConfig(
  deps: OAuthRoutesDeps,
  connector: AnyConnector,
  spec: OAuthSpec,
  pending: OAuthPending,
  code: string,
  client: { id: string; secret: string },
): Promise<Record<string, unknown>> {
  const { provider } = pending;
  const tokenClient = tokenHttp(spec, provider, deps.fetchImpl);
  const tokens = await exchangeCode(spec, client, code, pending.verifier, tokenClient);
  const setupHttp = createConnectorHttp({
    provider,
    hosts: spec.setupHosts,
    fetchImpl: deps.fetchImpl,
  });
  // Dans cet ordre, pour que `toConfig` ne puisse rien écraser.
  const parsed = connector.configSchema.safeParse({
    ...(await spec.toConfig(tokens, pending.preFields, setupHttp)),
    authMode: 'oauth',
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  });
  if (!parsed.success) throw new ConnectorHttpError(null, 'Configuration refusée');
  return parsed.data;
}

// La vérification a répondu qu'elle ne trouve pas ce que l'utilisateur a saisi avant le clic (un
// dépôt, un projet, une base, un espace) : le retour dit de revoir les champs, pas de réessayer.
class PreFieldsRejected extends Error {
  override name = 'PreFieldsRejected';
}

// Une erreur 4xx de l'outil (sauf 429, la limite de requêtes) est une erreur de saisie ; les clés
// refusées (401, 403 de l'outil) sont déjà des ConnectorAuthError, avant d'arriver ici.
function isFieldError(error: unknown): error is ConnectorHttpError {
  if (!(error instanceof ConnectorHttpError) || error.status === null) return false;
  return error.status >= 400 && error.status < 500 && error.status !== 429;
}

async function verifyConfig(
  connector: AnyConnector,
  config: Record<string, unknown>,
  http: ConnectorHttp,
): Promise<{ account: string; accountKey?: string }> {
  try {
    return await connector.verify(config, http);
  } catch (error) {
    if (isFieldError(error)) throw new PreFieldsRejected(error.message, { cause: error });
    throw error;
  }
}

// « Reconnecter » a rendu un autre compte, ou un autre site que celui gardé (Jira retombe sur le
// premier site quand le sien n'est plus accessible) : la connexion garde ses jetons.
class OtherAccount extends Error {
  override name = 'OtherAccount';
}

// Le compte se reconnaît à l'identifiant stable rendu par `verify` (`accountKey`, gardé dans la config
// ouverte). Une connexion enregistrée sans identifiant (ou un outil qui n'en rend pas) se reconnaît au
// libellé, sans le nombre des autres sites (Jira, Confluence). Les champs avant le clic gardés doivent
// revenir tels quels.
function sameAccount(
  stored: { label: string; config: Record<string, unknown> },
  provider: ProviderId,
  verified: { account: string; accountKey?: string },
  config: Record<string, unknown>,
  preFields: Record<string, unknown>,
): boolean {
  const { accountKey } = stored.config;
  const same =
    typeof accountKey === 'string' && verified.accountKey !== undefined
      ? accountKey === verified.accountKey
      : withoutOtherSites(stored.label) ===
        withoutOtherSites(accountLabel(verified.account, PROVIDER_LABELS[provider]));
  if (!same) return false;
  return Object.entries(preFields).every(
    ([name, value]) => JSON.stringify(config[name]) === JSON.stringify(value),
  );
}

// Du code reçu à la connexion créée (ou à la même connexion, reconnectée).
async function connect(
  ctx: TenantContext,
  deps: OAuthRoutesDeps,
  connector: AnyConnector,
  spec: OAuthSpec,
  pending: OAuthPending,
  code: string,
  client: { id: string; secret: string },
): Promise<void> {
  const { provider } = pending;
  const config = await oauthConfig(deps, connector, spec, pending, code, client);
  const http = createConnectorHttp({
    provider,
    hosts: connector.hosts(config),
    minIntervalMs: connector.minIntervalMs,
    fetchImpl: deps.fetchImpl,
  });
  const verified = await verifyConfig(connector, config, http);
  const { accountKey } = verified;
  const kept = accountKey === undefined ? config : { ...config, accountKey };
  const secretFields = [...OAUTH_SECRET_FIELDS, ...connector.secretFields];
  if (pending.reconnectId) {
    const stored = (await listConnections(ctx)).find((view) => view.id === pending.reconnectId);
    if (!stored) throw new ConnectorHttpError(null, 'Connexion introuvable');
    if (!sameAccount(stored, provider, verified, config, pending.preFields))
      throw new OtherAccount();
    const options = { reconnect: true } as const;
    const saved = await saveOAuthTokens(ctx, pending.reconnectId, kept, secretFields, options);
    if (!saved) throw new ConnectorHttpError(null, 'Connexion introuvable');
    return;
  }
  await createConnection(ctx, {
    provider,
    label: accountLabel(verified.account, PROVIDER_LABELS[provider]),
    config: kept,
    secretFields,
    since: new Date((deps.now ?? Date.now)() - Number(pending.since) * DAY_MS),
  });
}

function failureCode(error: unknown, provider: ProviderId): ReturnCode {
  logError('connector.oauth_failed', error, { provider });
  if (error instanceof OAuthRefusedError) return error.adminConsent ? 'admin' : 'refuse';
  if (error instanceof PreFieldsRejected) return 'champs';
  if (error instanceof OtherAccount) return 'autre_compte';
  return error instanceof ConnectorAuthError ? 'refuse' : 'indisponible';
}

// null : branché. Sinon le code de l'erreur, dans l'ordre de la spec : accord administrateur, refus
// de l'éditeur, puis cookie, session et `state`, puis l'échange.
async function finishReturn(
  c: Context,
  deps: OAuthRoutesDeps,
  app: string,
  pending: OAuthPending | null,
  provider: ProviderId | null,
): Promise<ReturnCode | null> {
  const query = c.req.query();
  const connector = provider ? deps.getConnector(provider) : null;
  const spec = connector?.oauth;
  const { error, code } = query;
  if (error) {
    const description = query.error_description ?? null;
    if (spec?.adminConsent?.isConsentError({ error, description })) return 'admin';
    return error === 'access_denied' ? 'annule' : 'refuse';
  }
  if (!code && query.admin_consent?.toLowerCase() === 'true') return 'admin_accorde';
  if (!pending || !connector || !spec || spec.appKey.toLowerCase() !== app) return 'expire';
  const ctx = await sessionContext(c);
  const sameSession = ctx?.userId === pending.userId && ctx.tenantId === pending.tenantId;
  if (!ctx || !sameSession || !query.state || !sameText(query.state, pending.state))
    return 'expire';
  const client = oauthClient(spec.appKey);
  if (!code) return 'refuse';
  if (!client || !connectorsKey()) return 'indisponible';
  try {
    await connect(ctx, deps, connector, spec, pending, code, client);
    return null;
  } catch (failure) {
    return failureCode(failure, pending.provider);
  }
}

async function returnHandler(c: Context, deps: OAuthRoutesDeps): Promise<Response> {
  const app = c.req.param('app') ?? '';
  const cookie = getCookie(c, OAUTH_COOKIE);
  deleteCookie(c, OAUTH_COOKIE, { path: OAUTH_COOKIE_PATH });
  const pending = cookie ? openPending(cookie, (deps.now ?? Date.now)()) : null;
  const provider = pending?.provider ?? asProviderId(app);
  const outcome = await finishReturn(c, deps, app, pending, provider);
  const tool: Record<string, string> = provider ? { outil: provider } : {};
  const params: Record<string, string> =
    outcome === null ? { branche: provider ?? '' } : { erreur: outcome, ...tool };
  return c.redirect(connexions(params), 302);
}

export function createOAuthRoutes(deps: OAuthRoutesDeps): Hono {
  const routes = new Hono();
  // Un lien piégé ne doit pas brancher un outil à l'insu de l'utilisateur : seul un formulaire
  // posté depuis Leon démarre le déroulé.
  const sameOrigin = csrf({ origin: new URL(env.BETTER_AUTH_URL).origin });
  routes.post('/:provider/debut', sameOrigin, (c) => startHandler(c, deps));
  routes.get('/:app/retour', (c) => returnHandler(c, deps));
  return routes;
}
