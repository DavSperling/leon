import { createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFetch } from '@/test/fake-fetch';
import { createConnectorHttp } from '../http';
import { authorizeUrl, exchangeCode, redirectUri, refreshTokens } from '../oauth';
import type { OAuthPending } from '../oauth-cookie';
import type { OAuthTokens } from '../types';
import { asanaConnector } from './connector';
import { asanaOAuth } from './oauth';

// Le socle OAuth importe `connections` (base de données) pour enregistrer les jetons : inutile ici.
vi.mock('../connections', () => ({ saveOAuthTokens: vi.fn() }));

const NOW = Date.UTC(2026, 9, 15, 9, 0, 0);
const CLIENT = { id: 'id-appli-asana', secret: `secret-${randomBytes(8).toString('hex')}` };
const TOKEN_URL = 'https://app.asana.com/-/oauth_token';

// Des jetons générés à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const ACCESS = `acc-${randomBytes(12).toString('hex')}`;
const REFRESH = `ref-${randomBytes(12).toString('hex')}`;
const NEXT_ACCESS = `acc-${randomBytes(12).toString('hex')}`;
const NEXT_REFRESH = `ref-${randomBytes(12).toString('hex')}`;

// Forme de la réponse de https://developers.asana.com/docs/oauth (lue le 15/10/2026), données inventées.
const USER = { id: 4673218951, gid: '4673218951', name: 'Marie Durand', email: 'marie@acme.test' };
const tokenAnswer = (access: string, refresh?: string) => ({
  access_token: access,
  expires_in: 3600,
  token_type: 'bearer',
  data: USER,
  ...(refresh ? { refresh_token: refresh } : {}),
});

const pending: OAuthPending = {
  provider: 'asana',
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
    provider: 'asana',
    hosts: [new URL(asanaOAuth.tokenUrl).host],
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

describe('asanaOAuth : description', () => {
  it('déclare les adresses d’Asana, PKCE, le secret avec les paramètres et un échange en formulaire', () => {
    expect(asanaOAuth).toMatchObject({
      appKey: 'ASANA',
      authorizeUrl: 'https://app.asana.com/-/oauth_authorize',
      tokenUrl: TOKEN_URL,
      pkce: true,
      clientAuth: 'body',
      preFields: ['workspace'],
      setupHosts: [],
    });
    expect(asanaOAuth.tokenBody ?? 'form').toBe('form');
    expect(asanaOAuth.extraAuthorizeParams).toBeUndefined();
    expect(asanaOAuth.extraTokenParams).toBeUndefined();
  });

  it('ne demande que des droits de lecture, ceux des seuls points d’accès que le connecteur appelle', () => {
    expect([...asanaOAuth.scopes].sort()).toEqual([
      'projects:read',
      'stories:read',
      'tasks:read',
      'users:read',
    ]);
    for (const scope of asanaOAuth.scopes) expect(scope).toMatch(/:read$/);
  });

  it('demande les droits séparés par une espace, avec PKCE S256 et le state', () => {
    const url = new URL(authorizeUrl(asanaOAuth, CLIENT, pending));

    expect(`${url.origin}${url.pathname}`).toBe('https://app.asana.com/-/oauth_authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT.id,
      redirect_uri: redirectUri(asanaOAuth),
      response_type: 'code',
      state: 'etat-1',
      scope: 'tasks:read projects:read stories:read users:read',
      code_challenge: createHash('sha256').update('verificateur-1').digest('base64url'),
      code_challenge_method: 'S256',
    });
    expect(redirectUri(asanaOAuth)).toMatch(/\/api\/v1\/connexions\/oauth\/asana\/retour$/);
  });

  it('reste sur l’hôte de l’API : l’échange de jetons et les appels du connecteur n’ont qu’un hôte', () => {
    const host = new URL(asanaOAuth.tokenUrl).host;

    expect(new URL(asanaOAuth.authorizeUrl).host).toBe(host);
    expect(asanaConnector.hosts({ authMode: 'oauth', accessToken: ACCESS })).toEqual([host]);
  });

  it('est celle que le connecteur porte', () => {
    expect(asanaConnector.oauth).toBe(asanaOAuth);
  });
});

describe('asanaOAuth : échange et renouvellement', () => {
  it('échange le code en formulaire, avec le vérificateur et le secret avec les paramètres', async () => {
    const { http, calls } = tokenHttp([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(ACCESS, REFRESH) },
    ]);

    const tokens = await exchangeCode(asanaOAuth, CLIENT, 'code-1', 'verificateur-1', http);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers['content-type']).toMatch(/^application\/x-www-form-urlencoded/);
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(calls[0]?.body).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: redirectUri(asanaOAuth),
      code_verifier: 'verificateur-1',
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(tokens).toEqual({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: new Date(NOW + 3600 * 1000).toISOString(), // jeton d'accès d'1 h
      scope: null,
      raw: { token_type: 'bearer', expires_in: 3600, data: USER },
    });
  });

  it('renouvelle avec le jeton de rafraîchissement et garde l’ancien quand Asana n’en rend pas de nouveau', async () => {
    const { http, calls } = tokenHttp([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(NEXT_ACCESS) },
    ]);

    const tokens = await refreshTokens(asanaOAuth, CLIENT, REFRESH, http);

    expect(calls[0]?.body).toEqual({
      grant_type: 'refresh_token',
      refresh_token: REFRESH,
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(tokens.accessToken).toBe(NEXT_ACCESS);
    expect(tokens.refreshToken).toBe(REFRESH);
    expect(tokens.expiresAt).toBe(new Date(NOW + 3600 * 1000).toISOString());
  });

  it('garde le nouveau jeton de rafraîchissement si Asana en rend un', async () => {
    const { http } = tokenHttp([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(NEXT_ACCESS, NEXT_REFRESH) },
    ]);

    const tokens = await refreshTokens(asanaOAuth, CLIENT, REFRESH, http);

    expect(tokens.refreshToken).toBe(NEXT_REFRESH);
  });
});

describe('asanaOAuth : toConfig', () => {
  const tokens: OAuthTokens = {
    accessToken: ACCESS,
    refreshToken: REFRESH,
    expiresAt: null,
    scope: null,
    raw: { token_type: 'bearer', expires_in: 3600, data: USER },
  };

  function setup() {
    const fetchImpl = fakeFetch([]);
    const http = createConnectorHttp({
      provider: 'asana',
      hosts: asanaOAuth.setupHosts,
      fetchImpl,
      sleep: async () => {},
    });
    return { http, calls: fetchImpl.calls };
  }

  it('garde l’espace saisi avant le clic, sans appeler Asana', async () => {
    const { http, calls } = setup();

    await expect(asanaOAuth.toConfig(tokens, { workspace: 'Acme' }, http)).resolves.toEqual({
      workspace: 'Acme',
    });
    expect(calls).toHaveLength(0);
  });

  it('ne rend rien sans espace saisi (le premier espace du compte est alors lu) et n’emporte rien du compte', async () => {
    const { http, calls } = setup();

    await expect(asanaOAuth.toConfig(tokens, {}, http)).resolves.toEqual({});
    await expect(asanaOAuth.toConfig(tokens, { workspace: '' }, http)).resolves.toEqual({});
    expect(calls).toHaveLength(0);
  });
});
