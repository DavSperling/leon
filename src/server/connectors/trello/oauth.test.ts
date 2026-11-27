import { createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFetch } from '@/test/fake-fetch';
import { createConnectorHttp } from '../http';
import { authorizeUrl, exchangeCode, redirectUri, refreshTokens, tokenHttp } from '../oauth';
import type { OAuthPending } from '../oauth-cookie';
import { trelloOAuth } from './oauth';

// Le socle OAuth importe `connections` (base de données) pour enregistrer les jetons : inutile ici.
vi.mock('../connections', () => ({ saveOAuthTokens: vi.fn() }));

const NOW = Date.UTC(2026, 10, 27, 9, 0, 0);
const TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const CLIENT = { id: 'id-appli-trello', secret: `secret-${randomBytes(8).toString('hex')}` };

// Des jetons générés à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const ACCESS = `acces-${randomBytes(12).toString('hex')}`;
const REFRESH = `renouv-${randomBytes(12).toString('hex')}`;
const NEXT_ACCESS = `acces-${randomBytes(12).toString('hex')}`;
const NEXT_REFRESH = `renouv-${randomBytes(12).toString('hex')}`;

// Forme de la réponse de oauth-2-confidential-client-usage (lue le 27/11/2026) : jeton d'une heure.
const tokenAnswer = (access: string, refresh: string) => ({
  access_token: access,
  refresh_token: refresh,
  expires_in: 3600,
  scope: 'read:board:trello write:board:trello read:member:trello offline_access',
  token_type: 'Bearer',
});

const pending: OAuthPending = {
  provider: 'trello',
  userId: 'u',
  tenantId: 't',
  state: 'etat-1',
  verifier: 'verificateur-1',
  since: '30',
  preFields: {},
  reconnectId: null,
  createdAt: NOW,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('trelloOAuth : description', () => {
  it('vise le client OAuth 2.0 de Trello chez Atlassian : PKCE, secret avec les paramètres, corps JSON', () => {
    expect(trelloOAuth).toMatchObject({
      appKey: 'TRELLO',
      authorizeUrl: 'https://auth.atlassian.com/authorize',
      tokenUrl: TOKEN_URL,
      scopes: ['read:board:trello', 'write:board:trello', 'read:member:trello', 'offline_access'],
      pkce: true,
      clientAuth: 'body',
      tokenBody: 'json',
      extraAuthorizeParams: { prompt: 'consent' },
      preFields: [],
      setupHosts: [],
    });
  });

  it('demande les droits séparés par une espace, le consentement et PKCE S256, sans audience', () => {
    const url = new URL(authorizeUrl(trelloOAuth, CLIENT, pending));

    expect(`${url.origin}${url.pathname}`).toBe('https://auth.atlassian.com/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT.id,
      redirect_uri: redirectUri(trelloOAuth),
      response_type: 'code',
      state: 'etat-1',
      scope: 'read:board:trello write:board:trello read:member:trello offline_access',
      prompt: 'consent',
      code_challenge: createHash('sha256').update('verificateur-1').digest('base64url'),
      code_challenge_method: 'S256',
    });
    expect(redirectUri(trelloOAuth)).toMatch(/\/api\/v1\/connexions\/oauth\/trello\/retour$/);
  });
});

describe('trelloOAuth : échange et renouvellement', () => {
  it('échange le code en JSON, avec le vérificateur et le secret avec les paramètres', async () => {
    const fetchImpl = fakeFetch([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(ACCESS, REFRESH) },
    ]);

    const tokens = await exchangeCode(
      trelloOAuth,
      CLIENT,
      'code-1',
      'verificateur-1',
      tokenHttp(trelloOAuth, 'trello', fetchImpl),
    );

    expect(fetchImpl.calls).toHaveLength(1);
    expect(fetchImpl.calls[0]?.headers['content-type']).toBe('application/json');
    expect(fetchImpl.calls[0]?.headers.authorization).toBeUndefined();
    expect(fetchImpl.calls[0]?.body).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: redirectUri(trelloOAuth),
      code_verifier: 'verificateur-1',
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(tokens).toMatchObject({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: new Date(NOW + 3600 * 1000).toISOString(), // jeton d'accès d'une heure
    });
  });

  it('renouvelle en JSON et garde le nouveau jeton de rafraîchissement (à usage unique)', async () => {
    const fetchImpl = fakeFetch([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(NEXT_ACCESS, NEXT_REFRESH) },
    ]);

    const tokens = await refreshTokens(
      trelloOAuth,
      CLIENT,
      REFRESH,
      tokenHttp(trelloOAuth, 'trello', fetchImpl),
    );

    expect(fetchImpl.calls[0]?.body).toEqual({
      grant_type: 'refresh_token',
      refresh_token: REFRESH,
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(tokens).toMatchObject({
      accessToken: NEXT_ACCESS,
      refreshToken: NEXT_REFRESH,
      expiresAt: new Date(NOW + 3600 * 1000).toISOString(),
    });
  });
});

describe('trelloOAuth : toConfig', () => {
  it('ne rend aucun champ propre à Trello et n’appelle pas l’éditeur', async () => {
    const fetchImpl = fakeFetch([]);
    const http = createConnectorHttp({
      provider: 'trello',
      hosts: trelloOAuth.setupHosts,
      fetchImpl,
      sleep: async () => {},
    });
    const tokens = {
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: null,
      scope: null,
      raw: {},
    };

    await expect(trelloOAuth.toConfig(tokens, {}, http)).resolves.toEqual({});
    expect(fetchImpl.calls).toHaveLength(0);
  });
});
