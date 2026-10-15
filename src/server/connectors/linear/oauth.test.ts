import { createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFetch } from '@/test/fake-fetch';
import { createConnectorHttp } from '../http';
import { authorizeUrl, exchangeCode, redirectUri, refreshTokens } from '../oauth';
import type { OAuthPending } from '../oauth-cookie';
import { linearOAuth } from './oauth';

// Le socle OAuth importe `connections` (base de données) pour enregistrer les jetons : inutile ici.
vi.mock('../connections', () => ({ saveOAuthTokens: vi.fn() }));

const NOW = Date.UTC(2026, 10, 2, 9, 0, 0);
const CLIENT = { id: 'id-appli-linear', secret: `secret-${randomBytes(8).toString('hex')}` };
const TOKEN_URL = 'https://api.linear.app/oauth/token';

// Des jetons générés à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const ACCESS = `lin_oauth_${randomBytes(12).toString('hex')}`;
const REFRESH = `lin_refresh_${randomBytes(12).toString('hex')}`;
const NEXT_ACCESS = `lin_oauth_${randomBytes(12).toString('hex')}`;
const NEXT_REFRESH = `lin_refresh_${randomBytes(12).toString('hex')}`;

// Forme de la réponse de https://linear.app/developers/oauth-2-0-authentication (lue le 15/10/2026).
const tokenAnswer = (access: string, refresh: string) => ({
  access_token: access,
  token_type: 'Bearer',
  expires_in: 86399,
  scope: 'read',
  refresh_token: refresh,
});

const pending: OAuthPending = {
  provider: 'linear',
  userId: 'u',
  tenantId: 't',
  state: 'etat-1',
  verifier: 'verificateur-1',
  since: '30',
  preFields: {},
  reconnectId: null,
  createdAt: NOW,
};

function tokenHttp(routes: Parameters<typeof fakeFetch>[0]) {
  const fetchImpl = fakeFetch(routes);
  const http = createConnectorHttp({
    provider: 'linear',
    hosts: [new URL(linearOAuth.tokenUrl).host],
    fetchImpl,
    sleep: async () => {},
  });
  return { http, calls: fetchImpl.calls };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('linearOAuth : description', () => {
  it('déclare les adresses de Linear, le droit de lecture, PKCE et le secret avec les paramètres', () => {
    expect(linearOAuth).toMatchObject({
      appKey: 'LINEAR',
      authorizeUrl: 'https://linear.app/oauth/authorize',
      tokenUrl: TOKEN_URL,
      scopes: ['read'],
      scopeSeparator: ',',
      pkce: true,
      clientAuth: 'body',
      extraAuthorizeParams: { actor: 'user' },
      preFields: [],
      setupHosts: [],
    });
    // L'échange se fait en formulaire (valeur par défaut du socle).
    expect(linearOAuth.tokenBody ?? 'form').toBe('form');
    expect(linearOAuth.extraTokenParams).toBeUndefined();
  });

  it('ne demande que le droit « read », au nom de l’utilisateur, avec PKCE S256', () => {
    const url = new URL(authorizeUrl(linearOAuth, CLIENT, pending));

    expect(`${url.origin}${url.pathname}`).toBe('https://linear.app/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT.id,
      redirect_uri: redirectUri(linearOAuth),
      response_type: 'code',
      state: 'etat-1',
      scope: 'read',
      actor: 'user',
      code_challenge: createHash('sha256').update('verificateur-1').digest('base64url'),
      code_challenge_method: 'S256',
    });
    expect(redirectUri(linearOAuth)).toMatch(/\/api\/v1\/connexions\/oauth\/linear\/retour$/);
  });
});

describe('linearOAuth : échange et renouvellement', () => {
  it('échange le code en formulaire, avec le vérificateur et le secret avec les paramètres', async () => {
    const { http, calls } = tokenHttp([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(ACCESS, REFRESH) },
    ]);

    const tokens = await exchangeCode(linearOAuth, CLIENT, 'code-1', 'verificateur-1', http);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers['content-type']).toMatch(/^application\/x-www-form-urlencoded/);
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(calls[0]?.body).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: redirectUri(linearOAuth),
      code_verifier: 'verificateur-1',
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(tokens).toEqual({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: new Date(NOW + 86399 * 1000).toISOString(), // jeton d'accès de 24 h
      scope: 'read',
      raw: { token_type: 'Bearer', expires_in: 86399, scope: 'read' },
    });
  });

  it('renouvelle avec le jeton de rafraîchissement et garde le nouveau, tournant', async () => {
    const { http, calls } = tokenHttp([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(NEXT_ACCESS, NEXT_REFRESH) },
    ]);

    const tokens = await refreshTokens(linearOAuth, CLIENT, REFRESH, http);

    expect(calls[0]?.body).toEqual({
      grant_type: 'refresh_token',
      refresh_token: REFRESH,
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(tokens.accessToken).toBe(NEXT_ACCESS);
    expect(tokens.refreshToken).toBe(NEXT_REFRESH);
    expect(tokens.expiresAt).toBe(new Date(NOW + 86399 * 1000).toISOString());
  });
});

describe('linearOAuth : toConfig', () => {
  it('ne rend aucun champ propre à Linear et n’appelle pas l’éditeur', async () => {
    const fetchImpl = fakeFetch([]);
    const http = createConnectorHttp({
      provider: 'linear',
      hosts: linearOAuth.setupHosts,
      fetchImpl,
      sleep: async () => {},
    });
    const tokens = {
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: null,
      scope: 'read',
      raw: {},
    };

    await expect(linearOAuth.toConfig(tokens, {}, http)).resolves.toEqual({});
    expect(fetchImpl.calls).toHaveLength(0);
  });
});
