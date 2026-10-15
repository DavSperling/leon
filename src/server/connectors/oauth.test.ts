import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderId } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { fakeFetch } from '@/test/fake-fetch';
import { fakeOAuthConnector } from '@/test/fake-oauth-connector';
import type { LoadedConnection } from './connections';
import { githubOAuth } from './github/oauth';
import { createConnectorHttp } from './http';
import { hubspotOAuth } from './hubspot/oauth';
import { atlassianOAuth } from './jira/oauth';
import { miroOAuth } from './miro/oauth';
import { notionOAuth } from './notion/oauth';
import {
  authorizeUrl,
  ensureFreshTokens,
  exchangeCode,
  OAUTH_SECRET_FIELDS,
  OAuthRefusedError,
  redirectUri,
  refreshTokens,
  tokenHttp,
} from './oauth';
import type { OAuthPending } from './oauth-cookie';
import { outlookOAuth } from './outlook/oauth';
import type { AnyConnector, OAuthSpec } from './types';

const saveOAuthTokens = vi.hoisted(() => vi.fn(async () => true));
vi.mock('./connections', () => ({ saveOAuthTokens }));

const TOKEN_URL = 'https://editeur.test/oauth/token';
const CLIENT = { id: 'id-appli', secret: 'secret-appli-xyz' };
const NOW = Date.UTC(2026, 9, 15, 10, 0, 0);

function spec(extra: Partial<OAuthSpec> = {}): OAuthSpec {
  return {
    appKey: 'GITHUB',
    authorizeUrl: 'https://editeur.test/oauth/authorize',
    tokenUrl: TOKEN_URL,
    scopes: ['read', 'offline'],
    pkce: false,
    clientAuth: 'body',
    preFields: [],
    setupHosts: [],
    toConfig: async () => ({}),
    ...extra,
  };
}

const pending: OAuthPending = {
  provider: 'github',
  userId: 'u',
  tenantId: 't',
  state: 'etat-1',
  verifier: 'verificateur-1',
  since: '30',
  preFields: {},
  reconnectId: null,
  createdAt: NOW,
};

function httpWith(routes: Parameters<typeof fakeFetch>[0]) {
  const fetchImpl = fakeFetch(routes);
  const http = createConnectorHttp({
    provider: 'github',
    hosts: ['editeur.test'],
    fetchImpl,
    sleep: async () => {},
  });
  return { http, calls: fetchImpl.calls };
}

const tokenRoute = (json: unknown, status = 200) => ({
  method: 'POST' as const,
  url: TOKEN_URL,
  status,
  json,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  saveOAuthTokens.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('redirectUri et authorizeUrl', () => {
  it("donne une seule adresse de retour par appli, celle d'Atlassian pour Jira et Confluence", () => {
    expect(redirectUri(spec({ appKey: 'ATLASSIAN' }))).toBe(
      'http://localhost:3000/api/v1/connexions/oauth/atlassian/retour',
    );
  });

  it("porte l'identifiant, l'adresse de retour, l'état et les droits", () => {
    const url = new URL(authorizeUrl(spec(), CLIENT, { ...pending, verifier: null }));

    expect(`${url.origin}${url.pathname}`).toBe('https://editeur.test/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'id-appli',
      redirect_uri: redirectUri(spec()),
      response_type: 'code',
      state: 'etat-1',
      scope: 'read offline',
    });
  });

  it('joint les droits par le séparateur demandé et n’en met aucun quand la liste est vide', () => {
    const comma = new URL(authorizeUrl(spec({ scopeSeparator: ',' }), CLIENT, pending));
    const none = new URL(authorizeUrl(spec({ scopes: [] }), CLIENT, pending));

    expect(comma.searchParams.get('scope')).toBe('read,offline');
    expect(none.searchParams.has('scope')).toBe(false);
  });

  it('ajoute le défi PKCE S256 du vérificateur', () => {
    const url = new URL(authorizeUrl(spec({ pkce: true }), CLIENT, pending));

    const challenge = createHash('sha256').update('verificateur-1').digest('base64url');
    expect(url.searchParams.get('code_challenge')).toBe(challenge);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.search).not.toContain('verificateur-1');
  });

  it('n’envoie pas de défi quand l’éditeur ne prend pas PKCE en charge', () => {
    const url = new URL(authorizeUrl(spec({ pkce: false }), CLIENT, pending));

    expect(url.searchParams.has('code_challenge')).toBe(false);
  });

  it('ajoute les paramètres propres à l’éditeur', () => {
    const url = new URL(
      authorizeUrl(
        spec({ extraAuthorizeParams: { audience: 'api.test', prompt: 'consent' } }),
        CLIENT,
        pending,
      ),
    );

    expect(url.searchParams.get('audience')).toBe('api.test');
    expect(url.searchParams.get('prompt')).toBe('consent');
  });
});

describe('exchangeCode', () => {
  const answer = {
    access_token: 'acces-1',
    refresh_token: 'rafraichir-1',
    expires_in: 3600,
    scope: 'read',
    id_token: 'identite-1',
    workspace_name: 'Acme',
  };

  it('envoie le code, l’adresse de retour et le vérificateur en formulaire, secret avec les paramètres', async () => {
    const { http, calls } = httpWith([tokenRoute(answer)]);

    await exchangeCode(
      spec({ pkce: true, extraTokenParams: { code: { type: 'web_server' } } }),
      CLIENT,
      'code-1',
      'verificateur-1',
      http,
    );

    expect(calls[0]?.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(calls[0]?.headers.accept).toBe('application/json');
    expect(calls[0]?.body).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: redirectUri(spec()),
      code_verifier: 'verificateur-1',
      type: 'web_server',
      client_id: 'id-appli',
      client_secret: 'secret-appli-xyz',
    });
  });

  it('lit les jetons, l’échéance et les droits, et prive raw des jetons', async () => {
    const { http } = httpWith([tokenRoute(answer)]);

    const tokens = await exchangeCode(spec(), CLIENT, 'code-1', null, http);

    expect(tokens).toEqual({
      accessToken: 'acces-1',
      refreshToken: 'rafraichir-1',
      expiresAt: new Date(NOW + 3_600_000).toISOString(),
      scope: 'read',
      raw: { expires_in: 3600, scope: 'read', workspace_name: 'Acme' },
    });
  });

  it('envoie le secret en Basic, hors des paramètres', async () => {
    const { http, calls } = httpWith([tokenRoute(answer)]);

    await exchangeCode(spec({ clientAuth: 'basic' }), CLIENT, 'code-1', null, http);

    const basic = Buffer.from('id-appli:secret-appli-xyz').toString('base64');
    expect(calls[0]?.headers.authorization).toBe(`Basic ${basic}`);
    expect(calls[0]?.body).not.toHaveProperty('client_secret');
    expect(calls[0]?.body).not.toHaveProperty('client_id');
  });

  it('envoie un corps JSON quand l’éditeur le demande', async () => {
    const { http, calls } = httpWith([tokenRoute(answer)]);

    await exchangeCode(spec({ tokenBody: 'json' }), CLIENT, 'code-1', null, http);

    expect(calls[0]?.headers['content-type']).toBe('application/json');
    expect(calls[0]?.body).toMatchObject({ grant_type: 'authorization_code', code: 'code-1' });
  });

  it('envoie tout en paramètres d’adresse, sans corps, quand l’éditeur le demande', async () => {
    const { http, calls } = httpWith([tokenRoute(answer)]);

    await exchangeCode(spec({ tokenBody: 'query' }), CLIENT, 'code-1', null, http);

    const url = new URL(calls[0]?.url ?? '');
    expect(url.searchParams.get('code')).toBe('code-1');
    expect(url.searchParams.get('client_secret')).toBe('secret-appli-xyz');
    expect(calls[0]?.body).toBeUndefined();
    expect(calls[0]?.method).toBe('POST');
  });

  it('garde expiresAt nul sans expires_in et le jeton de rafraîchissement nul sans refresh_token', async () => {
    const { http } = httpWith([tokenRoute({ access_token: 'acces-1' })]);

    const tokens = await exchangeCode(spec(), CLIENT, 'code-1', null, http);

    expect(tokens).toMatchObject({ refreshToken: null, expiresAt: null, scope: null });
  });

  it('lève OAuthRefusedError sur une réponse 200 qui porte error (GitHub)', async () => {
    const { http } = httpWith([tokenRoute({ error: 'bad_verification_code' })]);

    const error = await exchangeCode(spec(), CLIENT, 'code-1', null, http).catch((e) => e);

    expect(error).toBeInstanceOf(OAuthRefusedError);
    expect(error.adminConsent).toBe(false);
    expect(error.message).toBe("Autorisation refusée par l'éditeur");
  });

  it('lève OAuthRefusedError sur un 400 qui porte error, sans reprendre le corps', async () => {
    const { http } = httpWith([
      tokenRoute({ error: 'invalid_grant', error_description: 'texte-secret-xyz' }, 400),
    ]);

    const error = await exchangeCode(spec(), CLIENT, 'code-1', null, http).catch((e) => e);

    expect(error).toBeInstanceOf(OAuthRefusedError);
    expect(error.message).not.toContain('texte-secret-xyz');
  });

  it('signale adminConsent quand la description de l’appli reconnaît un refus faute d’accord', async () => {
    const adminConsent = {
      isConsentError: ({ description }: { description: string | null }) =>
        description?.includes('AADSTS65001') ?? false,
      url: () => 'https://admin.test',
    };
    const { http } = httpWith([
      tokenRoute({ error: 'invalid_grant', error_description: 'AADSTS65001: consentement' }, 400),
    ]);

    const error = await exchangeCode(spec({ adminConsent }), CLIENT, 'code-1', null, http).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(OAuthRefusedError);
    expect(error.adminConsent).toBe(true);
  });

  it('refuse une réponse sans jeton d’accès, sans en reprendre le corps', async () => {
    const { http } = httpWith([tokenRoute({ token_type: 'bearer', note: 'corps-secret-xyz' })]);

    const error = await exchangeCode(spec(), CLIENT, 'code-1', null, http).catch((e) => e);

    expect(error).toMatchObject({ name: 'ConnectorHttpError', message: 'Réponse inattendue' });
    expect(error.message).not.toContain('corps-secret-xyz');
  });
});

describe('refreshTokens', () => {
  it('envoie le jeton de rafraîchissement et les paramètres de renouvellement', async () => {
    const { http, calls } = httpWith([
      tokenRoute({ access_token: 'acces-2', refresh_token: 'rafraichir-2', expires_in: 60 }),
    ]);

    const tokens = await refreshTokens(
      spec({ extraTokenParams: { code: { type: 'web_server' }, refresh: { type: 'refresh' } } }),
      CLIENT,
      'rafraichir-1',
      http,
    );

    expect(calls[0]?.body).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'rafraichir-1',
      type: 'refresh',
      client_id: 'id-appli',
      client_secret: 'secret-appli-xyz',
    });
    expect(tokens).toMatchObject({ accessToken: 'acces-2', refreshToken: 'rafraichir-2' });
  });

  it.each([400, 401, 403])(
    'lève OAuthRefusedError sur un %i qui porte invalid_grant',
    async (status) => {
      const { http } = httpWith([tokenRoute({ error: 'invalid_grant' }, status)]);

      await expect(refreshTokens(spec(), CLIENT, 'rafraichir-1', http)).rejects.toBeInstanceOf(
        OAuthRefusedError,
      );
    },
  );

  it('garde le jeton de rafraîchissement précédent quand la réponse n’en rend pas (Asana)', async () => {
    const { http } = httpWith([tokenRoute({ access_token: 'acces-2', expires_in: 3600 })]);

    const tokens = await refreshTokens(spec(), CLIENT, 'rafraichir-1', http);

    expect(tokens.refreshToken).toBe('rafraichir-1');
  });

  it('rend expiresAt nul sans expires_in', async () => {
    const { http } = httpWith([tokenRoute({ access_token: 'acces-2' })]);

    expect((await refreshTokens(spec(), CLIENT, 'rafraichir-1', http)).expiresAt).toBeNull();
  });
});

// Le refus de chaque éditeur, sous la forme que sa documentation décrit : celle de la RFC 6749
// (`error`) pour la plupart, une autre pour Notion (`object: 'error'`, `code`) et Miro (`type: 'error'`,
// `code`). Ni l'échange du code ni le renouvellement ne doivent le prendre pour une panne.
describe('refus documenté par chaque éditeur', () => {
  const cases: [ProviderId, OAuthSpec, number, Record<string, unknown>][] = [
    [
      'notion',
      notionOAuth,
      400,
      { object: 'error', status: 400, code: 'invalid_grant', message: 'texte-secret-xyz' },
    ],
    [
      'miro',
      miroOAuth,
      401,
      {
        status: 401,
        code: 'oauthError',
        message: 'Invalid authorization code: texte-secret-xyz',
        type: 'error',
      },
    ],
    [
      'hubspot',
      hubspotOAuth,
      400,
      { error: 'invalid_grant', status: 'BAD_REFRESH_TOKEN', message: 'texte-secret-xyz' },
    ],
    ['github', githubOAuth, 200, { error: 'bad_refresh_token' }],
    ['jira', atlassianOAuth([]), 403, { error: 'invalid_grant' }],
    [
      'outlook',
      outlookOAuth,
      400,
      { error: 'invalid_grant', error_description: 'AADSTS70000: texte-secret-xyz' },
    ],
  ];

  const run = (
    provider: ProviderId,
    spec: OAuthSpec,
    status: number,
    body: Record<string, unknown>,
    action: 'exchange' | 'refresh',
  ) => {
    const http = tokenHttp(
      spec,
      provider,
      fakeFetch([{ method: 'POST', url: spec.tokenUrl, status, json: body }]),
    );
    return action === 'exchange'
      ? exchangeCode(spec, CLIENT, 'code-1', 'verificateur-1', http)
      : refreshTokens(spec, CLIENT, 'rafraichir-1', http);
  };

  it.each(cases)('%s : à l’échange du code', async (provider, spec, status, body) => {
    const error = await run(provider, spec, status, body, 'exchange').catch((e) => e);

    expect(error).toBeInstanceOf(OAuthRefusedError);
    expect(error.message).toBe("Autorisation refusée par l'éditeur");
  });

  it.each(cases)('%s : au renouvellement', async (provider, spec, status, body) => {
    const error = await run(provider, spec, status, body, 'refresh').catch((e) => e);

    expect(error).toBeInstanceOf(OAuthRefusedError);
    expect(error.message).toBe("Autorisation refusée par l'éditeur");
  });

  it('ne prend pas pour un refus une réponse sans jeton qui ne porte aucune erreur', async () => {
    const { http } = httpWith([tokenRoute({ token_type: 'bearer', code: 12 })]);

    const error = await exchangeCode(spec(), CLIENT, 'code-1', null, http).catch((e) => e);

    expect(error).toMatchObject({ name: 'ConnectorHttpError', message: 'Réponse inattendue' });
  });

  it('garde une réponse qui porte un jeton, même avec un champ code', async () => {
    const { http } = httpWith([tokenRoute({ access_token: 'acces-1', code: 'oauthError' })]);

    expect((await exchangeCode(spec(), CLIENT, 'code-1', null, http)).accessToken).toBe('acces-1');
  });
});

describe('ensureFreshTokens', () => {
  const ctx = { tenantId: 't', userId: 'u', principals: ['u', 't'] } as TenantContext;
  const connector: AnyConnector = { ...fakeOAuthConnector(), oauth: spec() };
  const inMinutes = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

  function connection(config: Record<string, unknown>): LoadedConnection {
    return {
      id: 'c1',
      provider: 'github',
      createdBy: 'u',
      cursor: null,
      since: new Date(NOW),
      config,
    };
  }

  const oauthConfig = (extra: Record<string, unknown> = {}) => ({
    authMode: 'oauth',
    accessToken: 'acces-1',
    refreshToken: 'rafraichir-1',
    expiresAt: inMinutes(2),
    repos: ['acme/leon'],
    ...extra,
  });

  const deps = (fetchImpl: typeof fetch, extra: { force?: boolean } = {}) => ({
    fetchImpl,
    now: () => new Date(NOW),
    ...extra,
  });

  beforeEach(() => {
    vi.stubEnv('LEON_OAUTH_GITHUB_ID', 'id-appli');
    vi.stubEnv('LEON_OAUTH_GITHUB_SECRET', 'secret-appli-xyz');
  });

  it('renouvelle un accès qui expire dans 2 minutes et enregistre avant de rendre la config', async () => {
    const fetchImpl = fakeFetch([
      tokenRoute({ access_token: 'acces-2', refresh_token: 'rafraichir-2', expires_in: 3600 }),
    ]);
    const order: string[] = [];
    saveOAuthTokens.mockImplementationOnce(async () => {
      order.push('enregistre');
      return true;
    });

    const config = await ensureFreshTokens(
      ctx,
      connection(oauthConfig()),
      connector,
      deps(fetchImpl),
    );
    order.push('rendu');

    expect(order).toEqual(['enregistre', 'rendu']);
    expect(config).toMatchObject({
      accessToken: 'acces-2',
      refreshToken: 'rafraichir-2',
      expiresAt: new Date(NOW + 3_600_000).toISOString(),
      repos: ['acme/leon'],
    });
    expect(saveOAuthTokens).toHaveBeenCalledWith(
      ctx,
      'c1',
      config,
      [...OAUTH_SECRET_FIELDS, 'token'],
      { reconnect: false },
    );
  });

  it('ne fait rien quand l’accès expire dans une heure', async () => {
    const fetchImpl = fakeFetch([]);
    const before = oauthConfig({ expiresAt: inMinutes(60) });

    expect(await ensureFreshTokens(ctx, connection(before), connector, deps(fetchImpl))).toEqual(
      before,
    );

    expect(fetchImpl.calls).toHaveLength(0);
    expect(saveOAuthTokens).not.toHaveBeenCalled();
  });

  it('ne fait rien quand expiresAt est nul, sauf avec force', async () => {
    const before = oauthConfig({ expiresAt: null });
    const idle = fakeFetch([]);
    expect(await ensureFreshTokens(ctx, connection(before), connector, deps(idle))).toEqual(before);
    expect(idle.calls).toHaveLength(0);

    const forced = fakeFetch([tokenRoute({ access_token: 'acces-2' })]);
    const config = await ensureFreshTokens(
      ctx,
      connection(before),
      connector,
      deps(forced, { force: true }),
    );

    expect(config).toMatchObject({ accessToken: 'acces-2', refreshToken: 'rafraichir-1' });
    expect(saveOAuthTokens).toHaveBeenCalledTimes(1);
  });

  it('lève OAuthRefusedError quand l’accès expire sans jeton de rafraîchissement', async () => {
    const fetchImpl = fakeFetch([]);

    await expect(
      ensureFreshTokens(
        ctx,
        connection(oauthConfig({ refreshToken: null })),
        connector,
        deps(fetchImpl),
      ),
    ).rejects.toBeInstanceOf(OAuthRefusedError);
    expect(fetchImpl.calls).toHaveLength(0);
  });

  it('lève OAuthRefusedError quand l’appli n’est plus configurée', async () => {
    vi.stubEnv('LEON_OAUTH_GITHUB_SECRET', '');

    await expect(
      ensureFreshTokens(ctx, connection(oauthConfig()), connector, deps(fakeFetch([]))),
    ).rejects.toBeInstanceOf(OAuthRefusedError);
  });

  it('lève OAuthRefusedError quand l’éditeur refuse le renouvellement, sans rien enregistrer', async () => {
    const fetchImpl = fakeFetch([tokenRoute({ error: 'invalid_grant' }, 400)]);

    await expect(
      ensureFreshTokens(ctx, connection(oauthConfig()), connector, deps(fetchImpl)),
    ).rejects.toBeInstanceOf(OAuthRefusedError);
    expect(saveOAuthTokens).not.toHaveBeenCalled();
  });

  it('laisse remonter une autre erreur de l’éditeur telle quelle', async () => {
    const fetchImpl = fakeFetch([tokenRoute({}, 404)]);

    const run = ensureFreshTokens(ctx, connection(oauthConfig()), connector, deps(fetchImpl));

    await expect(run).rejects.toMatchObject({ name: 'ConnectorHttpError', status: 404 });
  });

  it('ne fait rien sur une connexion à clé', async () => {
    const fetchImpl = fakeFetch([]);
    const key = { token: 'cle', repos: ['acme/leon'] };

    expect(await ensureFreshTokens(ctx, connection(key), connector, deps(fetchImpl))).toEqual(key);
    expect(fetchImpl.calls).toHaveLength(0);
  });
});
