import { createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFetch } from '@/test/fake-fetch';
import { createConnectorHttp } from '../http';
import { authorizeUrl, exchangeCode, redirectUri } from '../oauth';
import type { OAuthPending } from '../oauth-cookie';
import type { OAuthTokens } from '../types';
import { attioConnector } from './connector';
import { attioOAuth } from './oauth';

// Le socle OAuth importe `connections` (base de données) pour enregistrer les jetons : inutile ici.
vi.mock('../connections', () => ({ saveOAuthTokens: vi.fn() }));

const NOW = Date.UTC(2026, 9, 15, 9, 0, 0);
const CLIENT = { id: 'id-appli-attio', secret: `secret-${randomBytes(8).toString('hex')}` };
const TOKEN_URL = 'https://app.attio.com/oauth/token';

// Un jeton généré à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const ACCESS = `acc-${randomBytes(12).toString('hex')}`;

// Forme de la réponse de https://docs.attio.com/docs/oauth/token (lue le 15/10/2026) : un jeton
// d'accès de l'espace et son type, rien d'autre (ni expiration, ni jeton de rafraîchissement).
const tokenAnswer = (access: string) => ({ access_token: access, token_type: 'Bearer' });

const pending: OAuthPending = {
  provider: 'attio',
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
    provider: 'attio',
    hosts: [new URL(attioOAuth.tokenUrl).host],
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

describe('attioOAuth : description', () => {
  it('déclare les adresses d’Attio, PKCE, le secret avec les paramètres et un échange en formulaire', () => {
    expect(attioOAuth).toMatchObject({
      appKey: 'ATTIO',
      authorizeUrl: 'https://app.attio.com/authorize',
      tokenUrl: TOKEN_URL,
      pkce: true,
      clientAuth: 'body',
      preFields: [],
      setupHosts: [],
    });
    expect(attioOAuth.tokenBody ?? 'form').toBe('form');
    expect(attioOAuth.extraTokenParams).toBeUndefined();
  });

  it('ne demande aucun droit : Attio les fixe dans la console de l’appli, pas dans l’adresse', () => {
    expect(attioOAuth.scopes).toEqual([]);
  });

  it('demande un jeton de l’espace, avec PKCE S256 et le state, sans paramètre scope', () => {
    const url = new URL(authorizeUrl(attioOAuth, CLIENT, pending));

    expect(`${url.origin}${url.pathname}`).toBe('https://app.attio.com/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT.id,
      redirect_uri: redirectUri(attioOAuth),
      response_type: 'code',
      state: 'etat-1',
      token_level: 'workspace',
      code_challenge: createHash('sha256').update('verificateur-1').digest('base64url'),
      code_challenge_method: 'S256',
    });
    expect(url.searchParams.has('scope')).toBe(false);
    expect(redirectUri(attioOAuth)).toMatch(/\/api\/v1\/connexions\/oauth\/attio\/retour$/);
  });

  it('échange les jetons sur app.attio.com et appelle l’API sur api.attio.com, sans hôte de plus', () => {
    expect(new URL(attioOAuth.tokenUrl).host).toBe('app.attio.com');
    expect(new URL(attioOAuth.authorizeUrl).host).toBe('app.attio.com');
    expect(attioConnector.hosts({ authMode: 'oauth', accessToken: ACCESS })).toEqual([
      'api.attio.com',
    ]);
  });

  it('est celle que le connecteur porte', () => {
    expect(attioConnector.oauth).toBe(attioOAuth);
  });
});

describe('attioOAuth : échange du code', () => {
  it('échange le code en formulaire, avec le vérificateur et le secret avec les paramètres', async () => {
    const { http, calls } = tokenHttp([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(ACCESS) },
    ]);

    const tokens = await exchangeCode(attioOAuth, CLIENT, 'code-1', 'verificateur-1', http);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers['content-type']).toMatch(/^application\/x-www-form-urlencoded/);
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(calls[0]?.body).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: redirectUri(attioOAuth),
      code_verifier: 'verificateur-1',
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    // Un jeton d'espace qui n'expire pas (« Attio access tokens do not currently expire ») et qu'on
    // ne renouvelle pas : ni expiration, ni jeton de rafraîchissement, ni droits rendus.
    expect(tokens).toEqual({
      accessToken: ACCESS,
      refreshToken: null,
      expiresAt: null,
      scope: null,
      raw: { token_type: 'Bearer' },
    });
  });
});

describe('attioOAuth : toConfig', () => {
  const tokens: OAuthTokens = {
    accessToken: ACCESS,
    refreshToken: null,
    expiresAt: null,
    scope: null,
    raw: { token_type: 'Bearer' },
  };

  it('ne rend rien et n’appelle pas Attio : l’espace se lit à la vérification (GET /v2/self)', async () => {
    const fetchImpl = fakeFetch([]);
    const http = createConnectorHttp({
      provider: 'attio',
      hosts: attioOAuth.setupHosts,
      fetchImpl,
      sleep: async () => {},
    });

    await expect(attioOAuth.toConfig(tokens, {}, http)).resolves.toEqual({});
    expect(fetchImpl.calls).toHaveLength(0);
  });
});
