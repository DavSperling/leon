import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
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
import { accountLabel, sameAccountKey } from './account-label';
import { listCatalog } from './catalog';
import { createConnection, listConnections, saveOAuthTokens } from './connections';
import { connectorsKey } from './crypto';
import {
  ConnectorAuthError,
  type ConnectorHttp,
  ConnectorHttpError,
  createConnectorHttp,
  NothingToReadError,
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
import {
  connectorHttp,
  createConnectLink,
  findAccount,
  forgetPipedreamUser,
  PIPEDREAM_SECRET_FIELDS,
  PipedreamConfigSchema,
  type PipedreamEnv,
  pipedreamEnv,
} from './pipedream';
import type { AnyConnector, OAuthSpec } from './types';

// Les routes du bouton « Se connecter avec… » : `POST /:outil/debut` envoie chez l'éditeur (ou chez
// Pipedream), `GET /:appli/retour` termine le branchement (`GET /pipedream/retour` pour Pipedream). Rien de ce que dit l'éditeur ne finit dans une
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
  | 'autre_compte'
  | 'vide';

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

// La connexion à reconnecter : elle doit exister, être de cet outil et avoir été branchée par
// l'utilisateur (un administrateur y mettrait son propre compte).
async function ownConnection(ctx: TenantContext, provider: ProviderId, value: string) {
  const id = z.uuid().safeParse(value);
  const stored = id.success
    ? (await listConnections(ctx)).find((view) => view.id === id.data && view.provider === provider)
    : undefined;
  return stored?.isCreator ? stored : null;
}

// « Reconnecter » : les champs ouverts de la connexion servent de champs avant le clic. Sinon les
// champs viennent du formulaire. null : champs refusés.
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
  const stored = await ownConnection(ctx, provider, values.reconnect);
  if (!stored) return 'absent';
  const kept = spec.preFields.filter((name) => name in stored.config);
  return {
    preFields: Object.fromEntries(kept.map((name) => [name, stored.config[name]])),
    reconnectId: stored.id,
  };
}

function setPending(c: Context, pending: OAuthPending): void {
  setCookie(c, OAUTH_COOKIE, sealPending(pending), {
    httpOnly: true,
    sameSite: 'Lax',
    secure: new URL(env.BETTER_AUTH_URL).protocol === 'https:',
    path: OAUTH_COOKIE_PATH,
    maxAge: OAUTH_COOKIE_MAX_AGE,
  });
}

async function startHandler(c: Context, deps: OAuthRoutesDeps): Promise<Response> {
  const provider = asProviderId(c.req.param('provider'));
  const connector = provider && deps.getConnector(provider);
  if (provider && connector?.pipedream) return pipedreamStart(c, deps, provider, connector);
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
  setPending(c, pending);
  return c.redirect(authorizeUrl(spec, client, pending), 303);
}

// Pipedream : un utilisateur Pipedream neuf par branchement (et par reconnexion), un lien de connexion
// limité à l'appli de l'outil, puis le retour sur `/pipedream/retour` avec le `state` du cookie.
async function pipedreamStart(
  c: Context,
  deps: OAuthRoutesDeps,
  provider: ProviderId,
  connector: AnyConnector,
): Promise<Response> {
  const pd = pipedreamEnv();
  const app = connector.pipedream?.app;
  if (!pd || !app) return c.json(NOT_FOUND, 404);
  const ctx = await sessionContext(c);
  if (!ctx) return c.redirect('/connexion', 303);
  if (!connectorsKey())
    return c.redirect(connexions({ erreur: 'indisponible', outil: provider }), 303);

  const values = stringValues(await c.req.parseBody());
  const since = z.enum(SINCE_VALUES).safeParse(values.since || DEFAULT_SINCE);
  const stored = values.reconnect ? await ownConnection(ctx, provider, values.reconnect) : null;
  if (values.reconnect && !stored) return c.json(NOT_FOUND, 404);
  if (!since.success) return c.redirect(connexions({ erreur: 'champs', outil: provider }), 303);

  const pending: OAuthPending = {
    provider,
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    state: randomBytes(24).toString('base64url'),
    verifier: null,
    since: since.data,
    preFields: {},
    reconnectId: stored?.id ?? null,
    createdAt: (deps.now ?? Date.now)(),
    pipedreamUser: `leon-${randomUUID()}`,
  };
  const success = new URL(`${OAUTH_COOKIE_PATH}/pipedream/retour`, env.BETTER_AUTH_URL);
  success.searchParams.set('state', pending.state);
  const failure = new URL(success);
  failure.searchParams.set('error', 'access_denied');
  let link: string;
  try {
    link = await createConnectLink(
      pd,
      {
        externalUserId: pending.pipedreamUser ?? '',
        app,
        successUri: success.toString(),
        errorUri: failure.toString(),
      },
      deps.fetchImpl,
    );
  } catch (error) {
    logError('connector.oauth_failed', error, { provider });
    return c.redirect(connexions({ erreur: 'indisponible', outil: provider }), 303);
  }
  setPending(c, pending);
  return c.redirect(link, 303);
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
// ouverte). Une connexion enregistrée sans identifiant (jusqu'à sa prochaine relève réussie, qui le lui
// donne : sync.ts), ou un outil qui n'en rend pas, se reconnaît au libellé, sans le nombre des autres
// sites (Jira, Confluence). Les champs avant le clic gardés doivent revenir tels quels.
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
      ? sameAccountKey(provider, accountKey, verified.accountKey)
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
): Promise<string | null> {
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
  } else {
    await createConnection(ctx, {
      provider,
      label: accountLabel(verified.account, PROVIDER_LABELS[provider]),
      config: kept,
      secretFields,
      since: new Date((deps.now ?? Date.now)() - Number(pending.since) * DAY_MS),
    });
  }
  // Branchée : une étape chez l'outil qui échoue ne la défait pas, on revient simplement à Leon.
  return (await spec.nextStep?.(config, http).catch(() => null)) ?? null;
}

// Le compte branché chez Pipedream, vérifié auprès de l'outil, puis la connexion créée (ou reconnectée,
// avec le même compte : l'ancien utilisateur Pipedream est alors oublié).
async function connectPipedream(
  ctx: TenantContext,
  deps: OAuthRoutesDeps,
  pd: PipedreamEnv,
  connector: AnyConnector,
  pending: OAuthPending,
  externalUserId: string,
): Promise<void> {
  const { provider } = pending;
  const account = await findAccount(
    pd,
    externalUserId,
    connector.pipedream?.app ?? '',
    deps.fetchImpl,
  );
  if (!account) throw new ConnectorAuthError(PROVIDER_LABELS[provider]);
  const parsed = PipedreamConfigSchema.safeParse({
    authMode: 'pipedream',
    externalUserId,
    accountId: account.id,
  });
  if (!parsed.success) throw new ConnectorHttpError(null, 'Configuration refusée');
  const config = parsed.data;
  const http = connectorHttp(provider, connector, config, { fetchImpl: deps.fetchImpl });
  const verified = await verifyConfig(connector, config, http);
  const { accountKey } = verified;
  const kept = accountKey === undefined ? config : { ...config, accountKey };
  const secretFields = [...PIPEDREAM_SECRET_FIELDS, ...connector.secretFields];
  if (pending.reconnectId) {
    const stored = (await listConnections(ctx)).find((view) => view.id === pending.reconnectId);
    if (!stored) throw new ConnectorHttpError(null, 'Connexion introuvable');
    if (!sameAccount(stored, provider, verified, config, {})) throw new OtherAccount();
    // Les champs ouverts sont réécrits en entier, comme après un « Reconnecter » OAuth.
    const options = { reconnect: true } as const;
    const saved = await saveOAuthTokens(ctx, pending.reconnectId, kept, secretFields, options);
    if (!saved) throw new ConnectorHttpError(null, 'Connexion introuvable');
    if (stored.config.externalUserId !== externalUserId)
      await forgetPipedreamUser(stored.config.externalUserId, deps.fetchImpl);
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
  if (error instanceof NothingToReadError) return 'vide';
  return error instanceof ConnectorAuthError ? 'refuse' : 'indisponible';
}

// Branché : `{ next }`, la page de l'outil où continuer (ou null). Sinon le code de l'erreur, dans
// l'ordre de la spec : accord administrateur, refus de l'éditeur, puis cookie, session et `state`,
// puis l'échange.
async function finishReturn(
  c: Context,
  deps: OAuthRoutesDeps,
  app: string,
  pending: OAuthPending | null,
  provider: ProviderId | null,
): Promise<ReturnCode | { next: string | null }> {
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
    return { next: await connect(ctx, deps, connector, spec, pending, code, client) };
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
  if (typeof outcome === 'object' && outcome.next) return c.redirect(outcome.next, 302);
  const tool: Record<string, string> = provider ? { outil: provider } : {};
  const params: Record<string, string> =
    typeof outcome === 'object' ? { branche: provider ?? '' } : { erreur: outcome, ...tool };
  return c.redirect(connexions(params), 302);
}

// Le retour de Pipedream : le cookie, la même session et le même `state`, puis le compte branché.
async function finishPipedream(
  c: Context,
  deps: OAuthRoutesDeps,
  pending: OAuthPending | null,
): Promise<ReturnCode | { next: null }> {
  const connector = pending ? deps.getConnector(pending.provider) : null;
  const externalUserId = pending?.pipedreamUser;
  if (!pending || !connector?.pipedream || !externalUserId) return 'expire';
  const ctx = await sessionContext(c);
  const sameSession = ctx?.userId === pending.userId && ctx.tenantId === pending.tenantId;
  const state = c.req.query('state');
  if (!ctx || !sameSession || !state || !sameText(state, pending.state)) return 'expire';
  if (c.req.query('error')) return 'annule';
  const pd = pipedreamEnv();
  if (!pd || !connectorsKey()) return 'indisponible';
  try {
    await connectPipedream(ctx, deps, pd, connector, pending, externalUserId);
    return { next: null };
  } catch (failure) {
    return failureCode(failure, pending.provider);
  }
}

async function pipedreamReturnHandler(c: Context, deps: OAuthRoutesDeps): Promise<Response> {
  const cookie = getCookie(c, OAUTH_COOKIE);
  deleteCookie(c, OAUTH_COOKIE, { path: OAUTH_COOKIE_PATH });
  const pending = cookie ? openPending(cookie, (deps.now ?? Date.now)()) : null;
  const outcome = await finishPipedream(c, deps, pending);
  const provider = pending?.provider ?? null;
  if (typeof outcome === 'object') return c.redirect(connexions({ branche: provider ?? '' }), 302);
  // Pas branché : l'utilisateur Pipedream de cet essai ne sert plus.
  await forgetPipedreamUser(pending?.pipedreamUser, deps.fetchImpl);
  return c.redirect(connexions({ erreur: outcome, ...(provider ? { outil: provider } : {}) }), 302);
}

export function createOAuthRoutes(deps: OAuthRoutesDeps): Hono {
  const routes = new Hono();
  // Un lien piégé ne doit pas brancher un outil à l'insu de l'utilisateur : seul un formulaire
  // posté depuis Leon démarre le déroulé.
  const sameOrigin = csrf({ origin: new URL(env.BETTER_AUTH_URL).origin });
  routes.post('/:provider/debut', sameOrigin, (c) => startHandler(c, deps));
  // Avant `/:app/retour`, qui la prendrait pour une appli OAuth.
  routes.get('/pipedream/retour', (c) => pipedreamReturnHandler(c, deps));
  routes.get('/:app/retour', (c) => returnHandler(c, deps));
  return routes;
}
