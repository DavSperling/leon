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
import { mondayConnector } from './connector';
import { mondayOAuth } from './oauth';

// Le socle OAuth importe `connections` (base de données) pour enregistrer les jetons : inutile ici.
vi.mock('../connections', () => ({ saveOAuthTokens: vi.fn() }));

const NOW = Date.UTC(2026, 10, 2, 9, 0, 0);
const CLIENT = { id: 'id-appli-monday', secret: `secret-${randomBytes(8).toString('hex')}` };
const TOKEN_URL = 'https://auth.monday.com/oauth_ms/oauth/token';

// Des jetons générés à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const ACCESS = `eyJ${randomBytes(18).toString('hex')}`;
const REFRESH = `eyJ${randomBytes(18).toString('hex')}`;
const NEXT_ACCESS = `eyJ${randomBytes(18).toString('hex')}`;
const NEXT_REFRESH = `eyJ${randomBytes(18).toString('hex')}`;

// Forme de la réponse de https://developer.monday.com/apps/docs/migrating-to-the-new-oauth-flow
// (lue le 15/10/2026) : ni `expires_in` (l'échéance est dans le jeton, claim `exp`), ni autre champ.
const tokenAnswer = (access: string, refresh: string) => ({
  access_token: access,
  refresh_token: refresh,
  token_type: 'Bearer',
  scope: 'boards:read me:read updates:read',
});

const pending: OAuthPending = {
  provider: 'monday',
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
    provider: 'monday',
    hosts: [new URL(mondayOAuth.tokenUrl).host],
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

describe('mondayOAuth : description', () => {
  it('déclare les adresses de monday.com, la lecture et l’écriture, PKCE, le secret dans un corps JSON', () => {
    expect(mondayOAuth).toMatchObject({
      appKey: 'MONDAY',
      authorizeUrl: 'https://auth.monday.com/oauth2/authorize',
      tokenUrl: TOKEN_URL,
      scopes: ['boards:read', 'updates:read', 'me:read', 'boards:write', 'updates:write'],
      pkce: true,
      clientAuth: 'body',
      tokenBody: 'json',
      preFields: [],
      setupHosts: [],
    });
    // Droits séparés par une espace (valeur par défaut du socle) ; aucun paramètre en plus.
    expect(mondayOAuth.scopeSeparator ?? ' ').toBe(' ');
    expect(mondayOAuth.extraAuthorizeParams).toBeUndefined();
    expect(mondayOAuth.extraTokenParams).toBeUndefined();
  });

  it('ne demande en écriture que les tableaux et les mises à jour', () => {
    expect(mondayOAuth.scopes.filter((scope) => !scope.endsWith(':read'))).toEqual([
      'boards:write',
      'updates:write',
    ]);
  });

  it('est branchée sur le connecteur, qui garde la clé collée', () => {
    expect(mondayConnector.oauth).toBe(mondayOAuth);
    expect(mondayConnector.secretFields).toEqual(['token']);
  });

  it('prépare l’adresse d’autorisation : droits, état et défi PKCE S256', () => {
    const url = new URL(authorizeUrl(mondayOAuth, CLIENT, pending));

    expect(`${url.origin}${url.pathname}`).toBe('https://auth.monday.com/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT.id,
      redirect_uri: redirectUri(mondayOAuth),
      response_type: 'code',
      state: 'etat-1',
      scope: 'boards:read updates:read me:read boards:write updates:write',
      code_challenge: createHash('sha256').update('verificateur-1').digest('base64url'),
      code_challenge_method: 'S256',
    });
    expect(redirectUri(mondayOAuth)).toMatch(/\/api\/v1\/connexions\/oauth\/monday\/retour$/);
  });
});

describe('mondayOAuth : échange et renouvellement', () => {
  it('échange le code en JSON, avec le vérificateur et le secret dans le corps', async () => {
    const { http, calls } = tokenHttp([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(ACCESS, REFRESH) },
    ]);

    const tokens = await exchangeCode(mondayOAuth, CLIENT, 'code-1', 'verificateur-1', http);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers['content-type']).toMatch(/^application\/json/);
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(calls[0]?.body).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: redirectUri(mondayOAuth),
      code_verifier: 'verificateur-1',
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    // Aucune échéance dans la réponse : le socle ne renouvelle alors que sur un refus (401).
    expect(tokens).toEqual({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: null,
      scope: 'boards:read me:read updates:read',
      raw: { token_type: 'Bearer', scope: 'boards:read me:read updates:read' },
    });
  });

  it('renouvelle en JSON et garde le nouveau jeton de rafraîchissement, tournant', async () => {
    const { http, calls } = tokenHttp([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(NEXT_ACCESS, NEXT_REFRESH) },
    ]);

    const tokens = await refreshTokens(mondayOAuth, CLIENT, REFRESH, http);

    expect(calls[0]?.headers['content-type']).toMatch(/^application\/json/);
    expect(calls[0]?.body).toEqual({
      grant_type: 'refresh_token',
      refresh_token: REFRESH,
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(tokens.accessToken).toBe(NEXT_ACCESS);
    expect(tokens.refreshToken).toBe(NEXT_REFRESH);
  });

  it('lève un refus sans reprendre le texte de l’éditeur quand le code est refusé', async () => {
    const { http } = tokenHttp([
      {
        method: 'POST',
        url: TOKEN_URL,
        status: 400,
        json: { error: 'invalid_grant', error_description: `code ${ACCESS} périmé` },
      },
    ]);

    const failure = await exchangeCode(mondayOAuth, CLIENT, 'code-1', 'verificateur-1', http).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(OAuthRefusedError);
    expect((failure as Error).message).not.toContain(ACCESS);
  });
});

describe('mondayOAuth : toConfig', () => {
  it('ne rend aucun champ propre à monday.com et n’appelle pas l’éditeur', async () => {
    const fetchImpl = fakeFetch([]);
    const http = createConnectorHttp({
      provider: 'monday',
      hosts: mondayOAuth.setupHosts,
      fetchImpl,
      sleep: async () => {},
    });
    const tokens = {
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: null,
      scope: 'boards:read me:read updates:read',
      raw: {},
    };

    await expect(mondayOAuth.toConfig(tokens, {}, http)).resolves.toEqual({});
    expect(fetchImpl.calls).toHaveLength(0);
  });
});
