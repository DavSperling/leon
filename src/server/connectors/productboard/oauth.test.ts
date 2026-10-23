import { createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFetch } from '@/test/fake-fetch';
import { createConnectorHttp } from '../http';
import {
  authorizeUrl,
  exchangeCode,
  OAuthRefusedError,
  redirectUri,
  refreshTokens,
} from '../oauth';
import type { OAuthPending } from '../oauth-cookie';
import tokenInfo from './fixtures/token-info.json';
import { productboardOAuth } from './oauth';

// Le socle OAuth importe `connections` (base de données) pour enregistrer les jetons : inutile ici.
vi.mock('../connections', () => ({ saveOAuthTokens: vi.fn() }));

const NOW = Date.UTC(2026, 9, 15, 9, 0, 0);
const CLIENT = { id: 'id-appli-productboard', secret: `secret-${randomBytes(8).toString('hex')}` };
const TOKEN_URL = 'https://app.productboard.com/oauth2/token';
const INFO_URL = 'https://app.productboard.com/oauth2/token/info';

// Des jetons générés à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const ACCESS = `pb-acces-${randomBytes(12).toString('hex')}`;
const REFRESH = `pb-refresh-${randomBytes(12).toString('hex')}`;
const NEXT_ACCESS = `pb-acces-${randomBytes(12).toString('hex')}`;
const NEXT_REFRESH = `pb-refresh-${randomBytes(12).toString('hex')}`;

// Forme de la réponse de https://developer.productboard.com/reference/oauth-authorization-code
// (lue le 15/10/2026) : accès de 24 h, jeton de rafraîchissement de 180 jours.
const tokenAnswer = (access: string, refresh: string) => ({
  access_token: access,
  token_type: 'Bearer',
  expires_in: 86400,
  refresh_token: refresh,
  refresh_token_expires_in: 15552000,
  created_at: 1791964800,
  scope: 'notes:read',
});

const pending: OAuthPending = {
  provider: 'productboard',
  userId: 'u',
  tenantId: 't',
  state: 'etat-1',
  verifier: 'verificateur-1',
  since: '30',
  preFields: {},
  reconnectId: null,
  createdAt: NOW,
};

function httpFor(hosts: string[], routes: Parameters<typeof fakeFetch>[0]) {
  const fetchImpl = fakeFetch(routes);
  const http = createConnectorHttp({
    provider: 'productboard',
    hosts,
    fetchImpl,
    sleep: async () => {},
  });
  return { http, calls: fetchImpl.calls };
}
const tokenHttp = (routes: Parameters<typeof fakeFetch>[0]) =>
  httpFor([new URL(productboardOAuth.tokenUrl).host], routes);

const paramsOf = (url: string | undefined) =>
  Object.fromEntries(new URL(url ?? '').searchParams) as Record<string, string>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('productboardOAuth : description', () => {
  it('déclare les adresses de Productboard, le droit de lecture des notes, PKCE et les paramètres d’adresse', () => {
    expect(productboardOAuth).toMatchObject({
      appKey: 'PRODUCTBOARD',
      authorizeUrl: 'https://app.productboard.com/oauth2/authorize',
      tokenUrl: TOKEN_URL,
      scopes: ['notes:read', 'notes:write'],
      pkce: true,
      clientAuth: 'body',
      tokenBody: 'query',
      preFields: [],
      setupHosts: ['app.productboard.com'],
    });
    expect(productboardOAuth.extraTokenParams).toBeUndefined();
    expect(productboardOAuth.adminConsent).toBeUndefined();
  });

  it('demande « notes:read notes:write », avec PKCE S256 et l’adresse de retour fixe', () => {
    const url = new URL(authorizeUrl(productboardOAuth, CLIENT, pending));

    expect(`${url.origin}${url.pathname}`).toBe('https://app.productboard.com/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT.id,
      redirect_uri: redirectUri(productboardOAuth),
      response_type: 'code',
      state: 'etat-1',
      scope: 'notes:read notes:write',
      code_challenge: createHash('sha256').update('verificateur-1').digest('base64url'),
      code_challenge_method: 'S256',
    });
    expect(redirectUri(productboardOAuth)).toMatch(
      /\/api\/v1\/connexions\/oauth\/productboard\/retour$/,
    );
  });
});

describe('productboardOAuth : échange et renouvellement', () => {
  it('échange le code avec tout en paramètres d’adresse, sans corps ni en-tête d’autorisation', async () => {
    const { http, calls } = tokenHttp([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(ACCESS, REFRESH) },
    ]);

    const tokens = await exchangeCode(productboardOAuth, CLIENT, 'code-1', 'verificateur-1', http);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url.split('?')[0]).toBe(TOKEN_URL);
    expect(calls[0]?.body).toBeUndefined();
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(paramsOf(calls[0]?.url)).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: redirectUri(productboardOAuth),
      code_verifier: 'verificateur-1',
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(tokens).toEqual({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: new Date(NOW + 86400 * 1000).toISOString(), // accès de 24 h
      scope: 'notes:read',
      raw: {
        token_type: 'Bearer',
        expires_in: 86400,
        refresh_token_expires_in: 15552000,
        created_at: 1791964800,
        scope: 'notes:read',
      },
    });
  });

  it('renouvelle avec le jeton de rafraîchissement et garde le nouveau, tournant', async () => {
    const { http, calls } = tokenHttp([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(NEXT_ACCESS, NEXT_REFRESH) },
    ]);

    const tokens = await refreshTokens(productboardOAuth, CLIENT, REFRESH, http);

    expect(calls[0]?.body).toBeUndefined();
    expect(paramsOf(calls[0]?.url)).toEqual({
      grant_type: 'refresh_token',
      refresh_token: REFRESH,
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(tokens.accessToken).toBe(NEXT_ACCESS);
    expect(tokens.refreshToken).toBe(NEXT_REFRESH);
    expect(tokens.expiresAt).toBe(new Date(NOW + 86400 * 1000).toISOString());
  });

  it('traite un jeton de rafraîchissement expiré comme un refus', async () => {
    const { http } = tokenHttp([
      { method: 'POST', url: TOKEN_URL, status: 400, json: { error: 'invalid_grant' } },
    ]);

    await expect(refreshTokens(productboardOAuth, CLIENT, REFRESH, http)).rejects.toBeInstanceOf(
      OAuthRefusedError,
    );
  });
});

describe('productboardOAuth : toConfig', () => {
  const tokens = {
    accessToken: ACCESS,
    refreshToken: REFRESH,
    expiresAt: null,
    scope: 'notes:read',
    raw: {},
  };
  const configFor = (routes: Parameters<typeof fakeFetch>[0]) => {
    const { http, calls } = httpFor(productboardOAuth.setupHosts, routes);
    return { run: () => productboardOAuth.toConfig(tokens, {}, http), calls };
  };

  it('garde le nom de l’espace lu par la page d’information du jeton', async () => {
    const { run, calls } = configFor([{ url: INFO_URL, json: tokenInfo }]);

    await expect(run()).resolves.toEqual({ workspace: 'Acme' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url.split('?')[0]).toBe(INFO_URL);
    expect(paramsOf(calls[0]?.url)).toEqual({ access_token: ACCESS });
  });

  it('ne garde rien d’autre que le nom de l’espace (ni l’utilisateur, ni son adresse)', async () => {
    const { run } = configFor([{ url: INFO_URL, json: tokenInfo }]);

    expect(JSON.stringify(await run())).not.toContain('marie@acme.test');
  });

  it.each([
    ['une page sans espace', { status: 200, json: { scopes: ['notes:read'] } }],
    ['un nom d’espace vide', { status: 200, json: { space: { name: '  ' } } }],
    ['une page introuvable', { status: 404, json: {} }],
    ['un jeton refusé', { status: 401, json: {} }],
  ])('se branche quand même avec %s, sans nom d’espace', async (_cas, answer) => {
    const { run } = configFor([{ url: INFO_URL, ...answer }]);

    await expect(run()).resolves.toEqual({});
  });
});
