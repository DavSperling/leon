import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '@/server/auth/auth';
import { createUserWithOrganization } from '@/server/auth/sign-up';
import type { TenantContext } from '@/server/auth/tenant-context';
import { resolveTenantContext } from '@/server/auth/tenant-context';
import { adminPool } from '@/test/db';
import { type FakeRoute, fakeFetch } from '@/test/fake-fetch';
import { fakeOAuthConnector } from '@/test/fake-oauth-connector';
import { createTestUser, seedConnection } from '@/test/fixtures';
import { TEST_ENV } from '@/test/test-env';
import { claimConnection, createConnection, listConnections } from './connections';
import { gmailConnector } from './gmail/connector';
import { ConnectorHttpError } from './http';
import { OAUTH_SECRET_FIELDS } from './oauth';
import { createOAuthRoutes } from './oauth-routes';
import { forgetPipedreamToken } from './pipedream';
import type { AnyConnector, OAuthSpec } from './types';

const BASE = '/api/v1/connexions/oauth';
const TOKEN_URL = 'https://github.test/login/oauth/access_token';
const ORIGIN = TEST_ENV.BETTER_AUTH_URL;
const password = 'motdepasse-solide';
const ACCESS = 'acces-secret-0001';
const REFRESH = 'rafraichir-secret-xyz';

const tenantIds: string[] = [];

afterAll(async () => {
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});

beforeEach(() => {
  vi.stubEnv('LEON_OAUTH_GITHUB_ID', 'id-appli');
  vi.stubEnv('LEON_OAUTH_GITHUB_SECRET', 'secret-appli-xyz');
});
afterEach(() => vi.unstubAllEnvs());

type Person = { ctx: TenantContext; session: string };

async function signUp(): Promise<Person> {
  const email = `paul-${randomUUID()}@example.com`;
  const result = await createUserWithOrganization({
    name: 'Paul',
    email,
    password,
    organizationName: 'Organisation de Paul',
  });
  if (!result.ok) throw new Error(`inscription refusée : ${result.error}`);
  const ctx = await resolveTenantContext(result.userId, result.tenantId);
  if (!ctx) throw new Error('contexte introuvable');
  tenantIds.push(ctx.tenantId);
  const { headers } = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  return { ctx, session: headers.get('set-cookie')?.split(';')[0] ?? '' };
}

const oauthSpec = (): OAuthSpec => fakeOAuthConnector().oauth as OAuthSpec;
const tokenRoute = (json: unknown, status = 200): FakeRoute => ({
  method: 'POST',
  url: TOKEN_URL,
  status,
  json,
});
const goodTokens = () =>
  tokenRoute({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 28_800 });

function makeApp(
  options: { routes?: FakeRoute[]; connector?: AnyConnector; now?: () => number } = {},
) {
  const fetchImpl = fakeFetch(options.routes ?? []);
  const routes = createOAuthRoutes({
    getConnector: () => options.connector ?? fakeOAuthConnector(),
    fetchImpl,
    now: options.now,
  });
  return { app: new Hono().basePath('/api').route('/v1/connexions/oauth', routes), fetchImpl };
}
type TestApp = ReturnType<typeof makeApp>['app'];

function start(
  app: TestApp,
  person: Person | null,
  form: Record<string, string> = { repos: 'acme/leon', since: '30' },
  headers: Record<string, string> = {},
  tool = 'github',
) {
  return app.request(`${BASE}/${tool}/debut`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: ORIGIN,
      ...(person ? { cookie: person.session } : {}),
      ...headers,
    },
    body: new URLSearchParams(form).toString(),
  });
}

const oauthCookieOf = (response: Response): string | undefined =>
  response.headers
    .getSetCookie()
    .find((line) => line.startsWith('leon_oauth='))
    ?.split(';')[0];
const stateOf = (response: Response) =>
  new URL(response.headers.get('location') ?? '').searchParams.get('state') ?? '';

function back(
  app: TestApp,
  person: Person | null,
  query: Record<string, string>,
  cookie: string | undefined,
  app_ = 'github',
) {
  const cookies = [person?.session, cookie].filter(Boolean).join('; ');
  return app.request(`${BASE}/${app_}/retour?${new URLSearchParams(query).toString()}`, {
    headers: cookies ? { cookie: cookies } : {},
  });
}

// Un aller complet jusqu'au retour de l'éditeur.
async function fullRound(
  person: Person,
  extra: Parameters<typeof makeApp>[0] = {},
  form?: Record<string, string>,
) {
  const { app, fetchImpl } = makeApp({ routes: [goodTokens()], ...extra });
  const go = await start(app, person, form);
  const cookie = oauthCookieOf(go);
  const response = await back(app, person, { code: 'code-1', state: stateOf(go) }, cookie);
  return { app, fetchImpl, go, cookie, response };
}

const connectionsOf = async (tenantId: string) =>
  (
    await adminPool.query<{ id: string }>('select id from connections where tenant_id = $1', [
      tenantId,
    ])
  ).rows;

const location = (response: Response) => response.headers.get('location');

describe('POST /:outil/debut', () => {
  it('renvoie vers /connexion sans session', async () => {
    const response = await start(makeApp().app, null);

    expect(response.status).toBe(303);
    expect(location(response)).toBe('/connexion');
    expect(oauthCookieOf(response)).toBeUndefined();
  });

  it('répond 404 pour un outil sans appli configurée, sans bouton, ou inconnu', async () => {
    const paul = await signUp();
    const { app } = makeApp();

    vi.stubEnv('LEON_OAUTH_GITHUB_SECRET', '');
    expect((await start(app, paul)).status).toBe(404);
    vi.stubEnv('LEON_OAUTH_GITHUB_SECRET', 'secret-appli-xyz');
    expect((await start(app, paul, undefined, {}, 'inconnu')).status).toBe(404);
    const noButton = makeApp({ connector: { ...fakeOAuthConnector(), oauth: undefined } }).app;
    expect((await start(noButton, paul)).status).toBe(404);
  });

  it("refuse un formulaire venu d'un autre site, sans poser de cookie", async () => {
    const paul = await signUp();

    const response = await start(makeApp().app, paul, undefined, { origin: 'https://evil.test' });

    expect(response.status).toBe(403);
    expect(oauthCookieOf(response)).toBeUndefined();
  });

  it('refuse un lien piégé : un GET ne démarre rien', async () => {
    const paul = await signUp();

    const response = await makeApp().app.request(`${BASE}/github/debut?repos=victime/prive`, {
      headers: { cookie: paul.session },
    });

    expect(response.status).not.toBe(303);
    expect(oauthCookieOf(response)).toBeUndefined();
  });

  it("renvoie chez l'éditeur et pose un cookie signé, httpOnly, limité à ces routes", async () => {
    const paul = await signUp();

    const response = await start(makeApp().app, paul);

    expect(response.status).toBe(303);
    const target = new URL(location(response) ?? '');
    expect(`${target.origin}${target.pathname}`).toBe('https://github.test/login/oauth/authorize');
    expect(target.searchParams.get('client_id')).toBe('id-appli');
    expect(target.search).not.toContain('secret-appli-xyz');
    const cookieLine = response.headers.getSetCookie().find((l) => l.startsWith('leon_oauth='));
    expect(cookieLine).toMatch(/HttpOnly/i);
    expect(cookieLine).toMatch(/SameSite=Lax/i);
    expect(cookieLine).toMatch(/Path=\/api\/v1\/connexions\/oauth/);
    expect(cookieLine).toMatch(/Max-Age=600/);
    expect(cookieLine).not.toContain('secret-appli-xyz');
  });

  it('renvoie vers la page Connexions quand les champs avant le clic sont invalides', async () => {
    const paul = await signUp();

    const response = await start(makeApp().app, paul, { repos: '', since: '30' });

    expect(response.status).toBe(303);
    expect(location(response)).toBe('/connexions?erreur=champs&outil=github');
    expect(oauthCookieOf(response)).toBeUndefined();
  });

  it('refuse une période inconnue', async () => {
    const paul = await signUp();

    const response = await start(makeApp().app, paul, { repos: 'acme/leon', since: '12' });

    expect(location(response)).toBe('/connexions?erreur=champs&outil=github');
  });
});

describe('GET /:appli/retour : le branchement', () => {
  it('branche puis enchaîne sur la page que l’outil demande (installation de l’appli GitHub)', async () => {
    const paul = await signUp();
    const next = 'https://github.com/apps/leon-memory/installations/new';

    const { response } = await fullRound(paul, {
      connector: fakeOAuthConnector({ nextStep: next }),
    });

    expect(response.status).toBe(302);
    expect(location(response)).toBe(next);
    expect(await connectionsOf(paul.ctx.tenantId)).toHaveLength(1);
  });

  it('reste branché et revient sur la page quand l’étape suivante échoue', async () => {
    const paul = await signUp();
    const connector = fakeOAuthConnector({ nextStep: new Error('GitHub ne répond pas') });

    const { response } = await fullRound(paul, { connector });

    expect(location(response)).toBe('/connexions?branche=github');
    expect(await connectionsOf(paul.ctx.tenantId)).toHaveLength(1);
  });

  it('crée la connexion avec ses jetons chiffrés, efface le cookie et revient sur la page', async () => {
    const paul = await signUp();

    const { response, fetchImpl } = await fullRound(paul);

    expect(response.status).toBe(302);
    expect(location(response)).toBe('/connexions?branche=github');
    expect(response.headers.getSetCookie().find((l) => l.startsWith('leon_oauth='))).toMatch(
      /Max-Age=0|Expires=/i,
    );
    expect(fetchImpl.calls).toHaveLength(1);
    expect(fetchImpl.calls[0]?.body).toMatchObject({
      code: 'code-1',
      client_secret: 'secret-appli-xyz',
    });

    const { rows } = await adminPool.query(
      'select label, provider, secret, secret_hint, config, status from connections where tenant_id = $1',
      [paul.ctx.tenantId],
    );
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toMatchObject({
      label: 'acme',
      provider: 'github',
      secret_hint: '0001',
      status: 'active',
    });
    expect(row.secret.startsWith('v1:')).toBe(true);
    expect(row.config).toMatchObject({ authMode: 'oauth', repos: ['acme/leon'] });
    expect(row.config).not.toHaveProperty('accountKey');
    const visible = JSON.stringify([row.config, await listConnections(paul.ctx)]);
    expect(visible).not.toContain(ACCESS);
    expect(visible).not.toContain(REFRESH);
    expect(row.secret).not.toContain(ACCESS);
  });

  it('garde l’identifiant stable du compte dans la config ouverte', async () => {
    const paul = await signUp();

    await fullRound(paul, { connector: fakeOAuthConnector({ accountKey: '4101' }) });

    const { rows } = await adminPool.query('select config from connections where tenant_id = $1', [
      paul.ctx.tenantId,
    ]);
    expect(rows[0].config.accountKey).toBe('4101');
  });

  it('range les jetons dans le bloc secret, relu par la relève', async () => {
    const paul = await signUp();
    await fullRound(paul);
    await adminPool.query(
      "update connections set next_sync_at = '2000-01-01T00:00:00Z' where tenant_id = $1",
      [paul.ctx.tenantId],
    );
    const [row] = await connectionsOf(paul.ctx.tenantId);

    const loaded = await claimConnection(paul.ctx, row?.id ?? '');

    expect(loaded?.config).toMatchObject({
      authMode: 'oauth',
      accessToken: ACCESS,
      refreshToken: REFRESH,
    });
    expect(Date.parse(String(loaded?.config.expiresAt))).toBeGreaterThan(Date.now());
  });
});

describe('GET /:appli/retour : ce qui ne crée rien', () => {
  const lonely = async (paul: Person) => (await connectionsOf(paul.ctx.tenantId)).length;

  it('« annule » quand l’utilisateur refuse chez l’éditeur', async () => {
    const paul = await signUp();
    const { app } = makeApp();
    const go = await start(app, paul);

    const response = await back(
      app,
      paul,
      { error: 'access_denied', state: stateOf(go) },
      oauthCookieOf(go),
    );

    expect(location(response)).toBe('/connexions?erreur=annule&outil=github');
    expect(await lonely(paul)).toBe(0);
  });

  it('« refuse » sur une autre erreur de l’éditeur', async () => {
    const paul = await signUp();
    const { app } = makeApp();
    const go = await start(app, paul);

    const response = await back(app, paul, { error: 'server_error' }, oauthCookieOf(go));

    expect(location(response)).toBe('/connexions?erreur=refuse&outil=github');
  });

  it('« expire » quand le state est différent', async () => {
    const paul = await signUp();
    const { app, fetchImpl } = makeApp();
    const go = await start(app, paul);

    const response = await back(app, paul, { code: 'c', state: 'autre-etat' }, oauthCookieOf(go));

    expect(location(response)).toBe('/connexions?erreur=expire&outil=github');
    expect(fetchImpl.calls).toHaveLength(0);
    expect(await lonely(paul)).toBe(0);
  });

  it('« expire » sans cookie, en gardant l’outil du chemin', async () => {
    const paul = await signUp();
    const { app } = makeApp();

    const response = await back(app, paul, { code: 'c', state: 'x' }, undefined);

    expect(location(response)).toBe('/connexions?erreur=expire&outil=github');
    expect(await lonely(paul)).toBe(0);
  });

  it('« expire » sur un cookie illisible ou à la signature fausse', async () => {
    const paul = await signUp();
    const { app } = makeApp();
    const go = await start(app, paul);
    const forged = `${oauthCookieOf(go)?.slice(0, -3)}abc`;

    for (const cookie of ['leon_oauth=n-importe-quoi', forged]) {
      const response = await back(app, paul, { code: 'c', state: stateOf(go) }, cookie);
      expect(location(response)).toBe('/connexions?erreur=expire&outil=github');
    }
    expect(await lonely(paul)).toBe(0);
  });

  it('« expire » quand le cookie est celui d’un autre utilisateur', async () => {
    const paul = await signUp();
    const marie = await signUp();
    const { app, fetchImpl } = makeApp();
    const go = await start(app, paul);

    const response = await back(app, marie, { code: 'c', state: stateOf(go) }, oauthCookieOf(go));

    expect(location(response)).toBe('/connexions?erreur=expire&outil=github');
    expect(fetchImpl.calls).toHaveLength(0);
    expect(await lonely(marie)).toBe(0);
  });

  it('« expire » sans session', async () => {
    const paul = await signUp();
    const { app } = makeApp();
    const go = await start(app, paul);

    const response = await back(app, null, { code: 'c', state: stateOf(go) }, oauthCookieOf(go));

    expect(location(response)).toBe('/connexions?erreur=expire&outil=github');
  });

  it('« expire » quand le cookie a plus de 10 minutes', async () => {
    const paul = await signUp();
    const go = await start(makeApp().app, paul);
    const later = makeApp({ now: () => Date.now() + 11 * 60_000 });

    const response = await back(
      later.app,
      paul,
      { code: 'c', state: stateOf(go) },
      oauthCookieOf(go),
    );

    expect(location(response)).toBe('/connexions?erreur=expire&outil=github');
    expect(await lonely(paul)).toBe(0);
  });

  it('« expire » quand le cookie vient d’une autre appli (autre chemin)', async () => {
    const paul = await signUp();
    const { app } = makeApp();
    const go = await start(app, paul);

    const response = await back(
      app,
      paul,
      { code: 'c', state: stateOf(go) },
      oauthCookieOf(go),
      'linear',
    );

    expect(location(response)).toBe('/connexions?erreur=expire&outil=github');
    expect(await lonely(paul)).toBe(0);
  });

  it('« expire » pour le retour du premier de deux onglets : le second a écrasé le cookie', async () => {
    const paul = await signUp();
    const { app, fetchImpl } = makeApp({ routes: [goodTokens()] });
    const first = await start(app, paul);
    const second = await start(app, paul);

    const response = await back(
      app,
      paul,
      { code: 'c', state: stateOf(first) },
      oauthCookieOf(second),
    );

    expect(location(response)).toBe('/connexions?erreur=expire&outil=github');
    expect(fetchImpl.calls).toHaveLength(0);
    expect(await lonely(paul)).toBe(0);
  });

  it('« refuse » quand l’éditeur refuse l’échange du code', async () => {
    const paul = await signUp();
    const { response } = await fullRound(paul, {
      routes: [tokenRoute({ error: 'invalid_grant' }, 400)],
    });

    expect(location(response)).toBe('/connexions?erreur=refuse&outil=github');
    expect(await lonely(paul)).toBe(0);
  });

  it('« refuse » quand la vérification de la connexion refuse le jeton', async () => {
    const paul = await signUp();
    const { response } = await fullRound(paul, {
      connector: fakeOAuthConnector({ verifyFails: true }),
    });

    expect(location(response)).toBe('/connexions?erreur=refuse&outil=github');
    expect(await lonely(paul)).toBe(0);
  });

  it('« champs » quand la vérification ne trouve pas ce que l’utilisateur a saisi', async () => {
    const paul = await signUp();
    const missing: AnyConnector = {
      ...fakeOAuthConnector(),
      verify: async () => {
        throw new ConnectorHttpError(404, 'Dépôt inaccessible : x');
      },
    };

    const { response } = await fullRound(paul, { connector: missing });

    expect(location(response)).toBe('/connexions?erreur=champs&outil=github');
    expect(await lonely(paul)).toBe(0);
  });

  it.each([
    ['sans statut', null],
    ['limite de requêtes', 429],
    ['panne de l’éditeur', 502],
  ])('« indisponible » quand la vérification échoue : %s', async (_name, status) => {
    const paul = await signUp();
    const down: AnyConnector = {
      ...fakeOAuthConnector(),
      verify: async () => {
        throw new ConnectorHttpError(status, 'GitHub a répondu autre chose');
      },
    };

    const { response } = await fullRound(paul, { connector: down });

    expect(location(response)).toBe('/connexions?erreur=indisponible&outil=github');
    expect(await lonely(paul)).toBe(0);
  });

  it('« indisponible » quand toConfig appelle un hôte hors de setupHosts', async () => {
    const paul = await signUp();
    const evil = fakeOAuthConnector({ toConfigUrl: 'https://evil.test/vole' });

    const { response, fetchImpl } = await fullRound(paul, { connector: evil });

    expect(location(response)).toBe('/connexions?erreur=indisponible&outil=github');
    expect(fetchImpl.calls.map((call) => call.url)).toEqual([TOKEN_URL]);
    expect(await lonely(paul)).toBe(0);
  });

  it('« indisponible » quand la configuration ne passe pas le schéma de l’outil', async () => {
    const paul = await signUp();
    const broken: AnyConnector = {
      ...fakeOAuthConnector(),
      oauth: { ...oauthSpec(), toConfig: async () => ({ repos: [] }) },
    };

    const { response } = await fullRound(paul, { connector: broken });

    expect(location(response)).toBe('/connexions?erreur=indisponible&outil=github');
    expect(await lonely(paul)).toBe(0);
  });

  it('ne met ni jeton ni détail de l’éditeur dans l’adresse de retour', async () => {
    const paul = await signUp();
    const { response } = await fullRound(paul, {
      routes: [tokenRoute({ error: 'invalid_grant', error_description: 'detail-secret-xyz' }, 400)],
    });

    expect(location(response)).not.toContain('detail-secret-xyz');
    expect(location(response)).not.toContain('invalid_grant');
  });
});

describe('accord de l’administrateur', () => {
  const adminConsent = {
    isConsentError: ({ error, description }: { error: string; description: string | null }) =>
      error === 'consent_required' || (description?.includes('AADSTS65001') ?? false),
    url: () => 'https://admin.test/accord',
  };
  const withConsent = (): AnyConnector => {
    const base = fakeOAuthConnector();
    return { ...base, oauth: { ...oauthSpec(), adminConsent } };
  };

  it('« admin » quand l’éditeur renvoie une erreur de consentement', async () => {
    const paul = await signUp();
    const { app } = makeApp({ connector: withConsent() });
    const go = await start(app, paul);

    const response = await back(app, paul, { error: 'consent_required' }, oauthCookieOf(go));

    expect(location(response)).toBe('/connexions?erreur=admin&outil=github');
  });

  it('« admin » quand l’échange du code est refusé faute d’accord', async () => {
    const paul = await signUp();
    const routes = [tokenRoute({ error: 'invalid_grant', error_description: 'AADSTS65001' }, 400)];

    const { response } = await fullRound(paul, { routes, connector: withConsent() });

    expect(location(response)).toBe('/connexions?erreur=admin&outil=github');
  });

  it('« admin_accorde » au retour du lien d’accord, sans cookie', async () => {
    const paul = await signUp();
    const { app } = makeApp({ connector: withConsent() });

    const response = await back(app, paul, { admin_consent: 'True' }, undefined);

    expect(location(response)).toBe('/connexions?erreur=admin_accorde&outil=github');
  });
});

describe('« Reconnecter »', () => {
  async function oauthConnection(
    paul: Person,
    status = 'error',
    stored: { label?: string; accountKey?: string } = {},
  ): Promise<string> {
    const id = await createConnection(paul.ctx, {
      provider: 'github',
      label: stored.label ?? 'acme',
      config: {
        ...(stored.accountKey ? { accountKey: stored.accountKey } : {}),
        authMode: 'oauth',
        accessToken: 'ancien-acces-0000',
        refreshToken: 'ancien-rafraichir',
        expiresAt: null,
        repos: ['acme/ancien'],
      },
      secretFields: [...OAUTH_SECRET_FIELDS, 'token'],
      since: new Date(),
    });
    await adminPool.query(
      "update connections set status = $2, last_error = 'Reconnectez GitHub', next_sync_at = null where id = $1",
      [id, status],
    );
    return id;
  }

  it('remplace les jetons de la même connexion et la relance, avec les champs déjà enregistrés', async () => {
    const paul = await signUp();
    const id = await oauthConnection(paul);
    const { app, fetchImpl } = makeApp({ routes: [goodTokens()] });

    const go = await start(app, paul, { reconnect: id, since: '30' });
    const response = await back(app, paul, { code: 'c', state: stateOf(go) }, oauthCookieOf(go));

    expect(location(response)).toBe('/connexions?branche=github');
    expect(fetchImpl.calls).toHaveLength(1);
    expect(await connectionsOf(paul.ctx.tenantId)).toEqual([{ id }]);
    const { rows } = await adminPool.query(
      'select status, last_error, secret_hint, config, next_sync_at from connections where id = $1',
      [id],
    );
    expect(rows[0]).toMatchObject({ status: 'active', last_error: null, secret_hint: '0001' });
    expect(rows[0].config.repos).toEqual(['acme/ancien']);
    expect(rows[0].next_sync_at).not.toBeNull();
  });

  // Audit 3 n° 13 : « Reconnecter » ne met pas un autre compte (ou un autre site) sous la même connexion.
  it('« autre_compte » quand l’éditeur rend un autre compte : la connexion garde ses jetons', async () => {
    const paul = await signUp();
    const id = await oauthConnection(paul);
    const connector = fakeOAuthConnector({ account: 'globex' });
    const { app } = makeApp({ routes: [goodTokens()], connector });

    const go = await start(app, paul, { reconnect: id, since: '30' });
    const response = await back(app, paul, { code: 'c', state: stateOf(go) }, oauthCookieOf(go));

    expect(location(response)).toBe('/connexions?erreur=autre_compte&outil=github');
    const { rows } = await adminPool.query(
      'select status, secret_hint, config from connections where id = $1',
      [id],
    );
    expect(rows[0]).toMatchObject({ status: 'error', secret_hint: '0000' });
    expect(rows[0].config.repos).toEqual(['acme/ancien']);
  });

  it('« autre_compte » quand la configuration retombe sur un autre site que celui gardé', async () => {
    const paul = await signUp();
    const id = await oauthConnection(paul);
    const connector = fakeOAuthConnector({ repos: ['acme/autre'] });
    const { app } = makeApp({ routes: [goodTokens()], connector });

    const go = await start(app, paul, { reconnect: id, since: '30' });
    const response = await back(app, paul, { code: 'c', state: stateOf(go) }, oauthCookieOf(go));

    expect(location(response)).toBe('/connexions?erreur=autre_compte&outil=github');
    const { rows } = await adminPool.query(
      'select secret_hint, config from connections where id = $1',
      [id],
    );
    expect(rows[0].secret_hint).toBe('0000');
    expect(rows[0].config.repos).toEqual(['acme/ancien']);
  });

  async function reconnect(paul: Person, id: string, connector: AnyConnector) {
    const { app } = makeApp({ routes: [goodTokens()], connector });
    const go = await start(app, paul, { reconnect: id, since: '30' });
    const response = await back(app, paul, { code: 'c', state: stateOf(go) }, oauthCookieOf(go));
    const { rows } = await adminPool.query(
      'select secret_hint, config from connections where id = $1',
      [id],
    );
    return { location: location(response), row: rows[0] };
  }

  // Audit 4 n° 9 : le compte se reconnaît à son identifiant stable, pas à son libellé.
  it('« autre_compte » quand l’identifiant diffère, même sous le même libellé', async () => {
    const paul = await signUp();
    const id = await oauthConnection(paul, 'error', { accountKey: '4101' });

    const { location: to, row } = await reconnect(
      paul,
      id,
      fakeOAuthConnector({ account: 'acme', accountKey: '9999' }),
    );

    expect(to).toBe('/connexions?erreur=autre_compte&outil=github');
    expect(row.secret_hint).toBe('0000');
    expect(row.config.accountKey).toBe('4101');
  });

  it('reconnecte le même identifiant même quand le libellé a changé (compte renommé)', async () => {
    const paul = await signUp();
    const id = await oauthConnection(paul, 'error', { accountKey: '4101' });

    const { location: to, row } = await reconnect(
      paul,
      id,
      fakeOAuthConnector({ account: 'acme-renomme', accountKey: '4101' }),
    );

    expect(to).toBe('/connexions?branche=github');
    expect(row.secret_hint).toBe('0001');
  });

  it('une connexion sans identifiant passe par le libellé, puis garde l’identifiant', async () => {
    const paul = await signUp();
    const id = await oauthConnection(paul);

    const { location: to, row } = await reconnect(
      paul,
      id,
      fakeOAuthConnector({ account: 'acme', accountKey: '4101' }),
    );

    expect(to).toBe('/connexions?branche=github');
    expect(row.config.accountKey).toBe('4101');
  });

  it('le repli sur le libellé ignore les autres sites disponibles (Jira)', async () => {
    const paul = await signUp();
    const label = 'Connecté : acme.atlassian.net, 1 autre site disponible';
    const id = await oauthConnection(paul, 'error', { label });

    const { location: to } = await reconnect(
      paul,
      id,
      fakeOAuthConnector({
        account: 'Connecté : acme.atlassian.net, 2 autres sites disponibles',
        accountKey: 'compte:site',
      }),
    );

    expect(to).toBe('/connexions?branche=github');
  });

  it('le repli sur le libellé refuse toujours un autre site', async () => {
    const paul = await signUp();
    const id = await oauthConnection(paul, 'error', { label: 'Connecté : acme.atlassian.net' });

    const { location: to } = await reconnect(
      paul,
      id,
      fakeOAuthConnector({ account: 'Connecté : globex.atlassian.net', accountKey: 'k' }),
    );

    expect(to).toBe('/connexions?erreur=autre_compte&outil=github');
  });

  it("répond 404, sans cookie, pour la connexion d'un autre outil", async () => {
    const paul = await signUp();
    const id = await seedConnection(paul.ctx, { provider: 'linear' });

    const response = await start(makeApp().app, paul, { reconnect: id, since: '30' });

    expect(response.status).toBe(404);
    expect(oauthCookieOf(response)).toBeUndefined();
  });

  it("répond 404, sans cookie, pour la connexion d'un autre tenant ou un identifiant illisible", async () => {
    const paul = await signUp();
    const marie = await signUp();
    const id = await oauthConnection(marie);

    for (const reconnect of [id, 'pas-un-identifiant']) {
      const response = await start(makeApp().app, paul, { reconnect, since: '30' });
      expect(response.status).toBe(404);
      expect(oauthCookieOf(response)).toBeUndefined();
    }
  });

  // Audit 2 n° 2 : une administratrice non plus, elle mettrait son propre compte à la place du sien.
  it("répond 404, sans cookie, pour la connexion d'un autre membre même quand on est administrateur", async () => {
    const paul = await signUp();
    const bob = await createTestUser(paul.ctx.tenantId, 'Bob');
    const id = await seedConnection(bob, { provider: 'github' });

    const response = await start(makeApp().app, paul, { reconnect: id, since: '30' });

    expect(response.status).toBe(404);
    expect(oauthCookieOf(response)).toBeUndefined();
  });

  // Audit n° 3 : un simple membre ne reconnecte pas l'outil d'un autre avec son propre compte.
  it("répond 404, sans cookie, pour la connexion d'un autre membre quand on n'est pas administrateur", async () => {
    const paul = await signUp();
    const bob = await createTestUser(paul.ctx.tenantId, 'Bob');
    const id = await seedConnection(bob, { provider: 'github' });
    await adminPool.query(
      `update member set role = 'member' where "userId" = $1 and "organizationId" = $2`,
      [paul.ctx.userId, paul.ctx.tenantId],
    );

    const response = await start(makeApp().app, paul, { reconnect: id, since: '30' });

    expect(response.status).toBe(404);
    expect(oauthCookieOf(response)).toBeUndefined();
  });
});

describe('Pipedream : Gmail par le bouton', () => {
  const PD = 'https://api.pipedream.com';
  const CONNECT = `${PD}/v1/connect/proj_essai`;
  const PROFILE = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';
  const pdToken = (): FakeRoute => ({
    method: 'POST',
    url: `${PD}/v1/oauth/token`,
    json: { access_token: 'pd-jeton', expires_in: 3600 },
  });
  const link = (): FakeRoute => ({
    method: 'POST',
    url: `${CONNECT}/tokens`,
    json: { connect_link_url: 'https://pipedream.com/_static/connect.html?token=ctok' },
  });
  // Par défaut, des comptes que Pipedream vient de créer.
  const accounts = (ids: string[], created = new Date().toISOString()): FakeRoute => ({
    url: /\/v1\/connect\/proj_essai\/accounts\?external_user_id=leon-/,
    json: {
      data: ids.map((id) => ({
        id,
        healthy: true,
        dead: false,
        created_at: created,
        updated_at: created,
        app: { name_slug: 'gmail' },
      })),
    },
  });
  const profile = (email = 'David@Acme.test'): FakeRoute => ({
    url: new RegExp(`^${CONNECT}/proxy/${Buffer.from(PROFILE).toString('base64url')}\\?`),
    json: { emailAddress: email },
  });
  const removal = (): FakeRoute => ({
    method: 'DELETE',
    url: /\/accounts\/apn_[^/?]+$/,
    status: 204,
  });

  beforeEach(() => {
    forgetPipedreamToken();
    vi.stubEnv('PIPEDREAM_PROJECT_ID', 'proj_essai');
    vi.stubEnv('PIPEDREAM_CLIENT_ID', 'client-essai');
    vi.stubEnv('PIPEDREAM_CLIENT_SECRET', 'secret-essai-pipedream');
  });

  // L'adresse de retour donnée à Pipedream porte le `state` du cookie.
  const linkBody = (fetchImpl: ReturnType<typeof fakeFetch>) =>
    fetchImpl.calls.find((call) => call.url === `${CONNECT}/tokens`)?.body as
      | { external_user_id: string; success_redirect_uri: string; error_redirect_uri: string }
      | undefined;
  const pdState = (fetchImpl: ReturnType<typeof fakeFetch>) =>
    new URL(linkBody(fetchImpl)?.success_redirect_uri ?? 'https://x.test').searchParams.get(
      'state',
    ) ?? '';

  async function connectGmail(person: Person, routes: FakeRoute[], form = { since: '30' }) {
    const made = makeApp({ routes: [pdToken(), link(), ...routes], connector: gmailConnector });
    const go = await start(made.app, person, form, {}, 'gmail');
    const response = await back(
      made.app,
      person,
      { state: pdState(made.fetchImpl) },
      oauthCookieOf(go),
      'pipedream',
    );
    return { ...made, go, response };
  }

  it('renvoie chez Pipedream, limité à Gmail, avec l’utilisateur Pipedream de la personne', async () => {
    const paul = await signUp();
    const { app, fetchImpl } = makeApp({ routes: [pdToken(), link()], connector: gmailConnector });

    const go = await start(app, paul, { since: '30' }, {}, 'gmail');

    expect(go.status).toBe(303);
    const target = new URL(location(go) ?? '');
    expect(target.origin).toBe('https://pipedream.com');
    expect(target.searchParams.get('app')).toBe('gmail');
    expect(oauthCookieOf(go)).toBeDefined();
    const body = linkBody(fetchImpl);
    expect(body?.external_user_id).toBe(`leon-${paul.ctx.userId}`);
    expect(body?.success_redirect_uri).toBe(
      `${ORIGIN}${BASE}/pipedream/retour?state=${encodeURIComponent(pdState(fetchImpl))}`,
    );
    expect(new URL(body?.error_redirect_uri ?? '').searchParams.get('error')).toBe('access_denied');
  });

  it('crée la connexion au retour : le compte chiffré, l’utilisateur et l’adresse lisibles', async () => {
    const paul = await signUp();
    const { response, fetchImpl } = await connectGmail(paul, [accounts(['apn_gm1']), profile()]);

    expect(location(response)).toBe('/connexions?branche=gmail');
    const { rows } = await adminPool.query(
      'select provider, label, config, secret_hint from connections where tenant_id = $1',
      [paul.ctx.tenantId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: 'gmail',
      label: 'David@Acme.test',
      secret_hint: '_gm1',
    });
    expect(rows[0].config).toEqual({
      authMode: 'pipedream',
      externalUserId: linkBody(fetchImpl)?.external_user_id,
      accountKey: 'david@acme.test',
    });
    // La relève relit le compte dans le bloc chiffré.
    const id = (await connectionsOf(paul.ctx.tenantId))[0]?.id ?? '';
    const loaded = await claimConnection(paul.ctx, id);
    expect(loaded?.config.accountId).toBe('apn_gm1');
  });

  it('« annule » au retour d’un refus, sans connexion ni rien retirer chez Pipedream', async () => {
    const paul = await signUp();
    const { app, fetchImpl } = makeApp({ routes: [pdToken(), link()], connector: gmailConnector });
    const go = await start(app, paul, { since: '30' }, {}, 'gmail');

    const response = await back(
      app,
      paul,
      { state: pdState(fetchImpl), error: 'access_denied' },
      oauthCookieOf(go),
      'pipedream',
    );

    expect(location(response)).toBe('/connexions?erreur=annule&outil=gmail');
    expect(await connectionsOf(paul.ctx.tenantId)).toEqual([]);
    expect(fetchImpl.calls.map((call) => call.method)).toEqual(['POST', 'POST']);
  });

  it('« refuse » quand aucun compte n’a été branché chez Pipedream', async () => {
    const paul = await signUp();
    const { response } = await connectGmail(paul, [accounts([])]);

    expect(location(response)).toBe('/connexions?erreur=refuse&outil=gmail');
    expect(await connectionsOf(paul.ctx.tenantId)).toEqual([]);
  });

  it('« expire » quand le state ne correspond pas, sans rien demander à Pipedream de plus', async () => {
    const paul = await signUp();
    const { app, fetchImpl } = makeApp({ routes: [pdToken(), link()], connector: gmailConnector });
    const go = await start(app, paul, { since: '30' }, {}, 'gmail');

    const response = await back(app, paul, { state: 'autre' }, oauthCookieOf(go), 'pipedream');

    expect(location(response)).toBe('/connexions?erreur=expire&outil=gmail');
    expect(fetchImpl.calls.map((call) => call.method)).toEqual(['POST', 'POST']);
  });

  it('répond 404 quand Pipedream n’est pas configuré sur le serveur', async () => {
    vi.stubEnv('PIPEDREAM_CLIENT_SECRET', '');
    const paul = await signUp();
    const { app } = makeApp({ connector: gmailConnector });

    expect((await start(app, paul, { since: '30' }, {}, 'gmail')).status).toBe(404);
  });

  it('« Reconnecter » garde la connexion et l’utilisateur, prend le nouveau compte et retire l’ancien', async () => {
    const paul = await signUp();
    const first = await connectGmail(paul, [accounts(['apn_old1']), profile()]);
    const id = (await connectionsOf(paul.ctx.tenantId))[0]?.id ?? '';

    const again = await connectGmail(
      paul,
      [accounts(['apn_new2']), profile('david@acme.test'), removal()],
      { reconnect: id, since: '30' } as { since: string },
    );

    expect(location(again.response)).toBe('/connexions?branche=gmail');
    expect(await connectionsOf(paul.ctx.tenantId)).toEqual([{ id }]);
    const loaded = await claimConnection(paul.ctx, id);
    expect(loaded?.config).toMatchObject({
      accountId: 'apn_new2',
      externalUserId: linkBody(first.fetchImpl)?.external_user_id,
    });
    expect(linkBody(again.fetchImpl)?.external_user_id).toBe(`leon-${paul.ctx.userId}`);
    expect(again.fetchImpl.calls.at(-1)).toMatchObject({
      method: 'DELETE',
      url: `${CONNECT}/accounts/apn_old1`,
    });
  });

  it('« Reconnecter » sur le même compte Pipedream, autorisé à nouveau, ne retire rien', async () => {
    const paul = await signUp();
    await connectGmail(paul, [accounts(['apn_old1']), profile()]);
    const id = (await connectionsOf(paul.ctx.tenantId))[0]?.id ?? '';

    const again = await connectGmail(
      paul,
      [accounts(['apn_old1'], '2026-10-20T10:00:00Z'), profile('david@acme.test')],
      { reconnect: id, since: '30' } as { since: string },
    );

    expect(location(again.response)).toBe('/connexions?branche=gmail');
    expect((await claimConnection(paul.ctx, id))?.config.accountId).toBe('apn_old1');
    expect(again.fetchImpl.calls.some((call) => call.method === 'DELETE')).toBe(false);
  });

  it('« autre_compte » quand la reconnexion rend une autre adresse', async () => {
    const paul = await signUp();
    await connectGmail(paul, [accounts(['apn_old1']), profile()]);
    const id = (await connectionsOf(paul.ctx.tenantId))[0]?.id ?? '';

    const again = await connectGmail(
      paul,
      [accounts(['apn_new2']), profile('quelquun@autre.test'), removal()],
      { reconnect: id, since: '30' } as { since: string },
    );

    expect(location(again.response)).toBe('/connexions?erreur=autre_compte&outil=gmail');
    const loaded = await claimConnection(paul.ctx, id);
    expect(loaded?.config.accountId).toBe('apn_old1');
    // Le compte créé pour rien est retiré ; l'ancien reste, la connexion s'en sert encore.
    expect(again.fetchImpl.calls.at(-1)).toMatchObject({
      method: 'DELETE',
      url: `${CONNECT}/accounts/apn_new2`,
    });
  });
});
