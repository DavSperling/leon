import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFetch } from '@/test/fake-fetch';
import { ConnectorAuthError, createConnectorHttp } from '../http';
import { authorizeUrl, exchangeCode, redirectUri, refreshTokens } from '../oauth';
import type { OAuthPending } from '../oauth-cookie';
import type { OAuthTokens } from '../types';
import { USER_AGENT } from './client';
import { basecampConnector } from './connector';
import authorization from './fixtures/authorization.json';
import profile from './fixtures/profile.json';
import { basecampOAuth } from './oauth';

// Le socle OAuth importe `connections` (base de données) pour enregistrer les jetons : inutile ici.
vi.mock('../connections', () => ({ saveOAuthTokens: vi.fn() }));

const NOW = Date.UTC(2026, 9, 15, 9, 0, 0);
const CLIENT = { id: 'id-appli-basecamp', secret: `secret-${randomBytes(8).toString('hex')}` };
const TOKEN_URL = 'https://launchpad.37signals.com/authorization/token';
const AUTHORIZATION_URL = 'https://launchpad.37signals.com/authorization.json';

// Des jetons générés à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const ACCESS = `bc_acces_${randomBytes(12).toString('hex')}`;
const REFRESH = `bc_refresh_${randomBytes(12).toString('hex')}`;
const NEXT_ACCESS = `bc_acces_${randomBytes(12).toString('hex')}`;
const NEXT_REFRESH = `bc_refresh_${randomBytes(12).toString('hex')}`;

// Forme de la réponse de https://github.com/basecamp/bc3-api/blob/master/sections/authentication.md
// (lue le 15/10/2026) : expires_in 1209600 secondes, soit deux semaines.
const tokenAnswer = (access: string, refresh?: string) => ({
  access_token: access,
  token_type: 'Bearer',
  expires_in: 1209600,
  ...(refresh ? { refresh_token: refresh } : {}),
});

const pending: OAuthPending = {
  provider: 'basecamp',
  userId: 'u',
  tenantId: 't',
  state: 'etat-1',
  verifier: null,
  since: '30',
  preFields: {},
  reconnectId: null,
  createdAt: NOW,
};

function tokenHttp(routes: Parameters<typeof fakeFetch>[0]) {
  const fetchImpl = fakeFetch(routes);
  const http = createConnectorHttp({
    provider: 'basecamp',
    hosts: [new URL(basecampOAuth.tokenUrl).host],
    fetchImpl,
    sleep: async () => {},
  });
  return { http, calls: fetchImpl.calls };
}

function setupHttp(routes: Parameters<typeof fakeFetch>[0]) {
  const fetchImpl = fakeFetch(routes);
  const http = createConnectorHttp({
    provider: 'basecamp',
    hosts: basecampOAuth.setupHosts,
    fetchImpl,
    sleep: async () => {},
  });
  return { http, calls: fetchImpl.calls };
}

const tokens = (): OAuthTokens => ({
  accessToken: ACCESS,
  refreshToken: REFRESH,
  expiresAt: new Date(NOW + 1209600 * 1000).toISOString(),
  scope: null,
  raw: {},
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('basecampOAuth : description', () => {
  it('déclare les adresses de Launchpad, aucun droit, pas de PKCE et le secret en paramètres d’adresse', () => {
    expect(basecampOAuth).toMatchObject({
      appKey: 'BASECAMP',
      authorizeUrl: 'https://launchpad.37signals.com/authorization/new',
      tokenUrl: TOKEN_URL,
      scopes: [],
      pkce: false,
      clientAuth: 'body',
      tokenBody: 'query',
      preFields: [],
      setupHosts: ['launchpad.37signals.com'],
    });
  });

  it('n’ajoute ni `type=web_server` ni `type=refresh` : la doc les dit hérités', () => {
    // Le socle envoie déjà `response_type` et `grant_type`, les paramètres que la doc recommande.
    expect(basecampOAuth.extraAuthorizeParams).toBeUndefined();
    expect(basecampOAuth.extraTokenParams).toBeUndefined();
  });

  it('demande l’autorisation avec client_id, redirect_uri, response_type et state, sans droit', () => {
    const url = new URL(authorizeUrl(basecampOAuth, CLIENT, pending));

    expect(`${url.origin}${url.pathname}`).toBe(
      'https://launchpad.37signals.com/authorization/new',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT.id,
      redirect_uri: redirectUri(basecampOAuth),
      response_type: 'code',
      state: 'etat-1',
    });
    expect(redirectUri(basecampOAuth)).toMatch(/\/api\/v1\/connexions\/oauth\/basecamp\/retour$/);
  });
});

describe('basecampOAuth : échange et renouvellement', () => {
  it('échange le code en paramètres d’adresse, sans corps ni en-tête d’autorisation', async () => {
    const { http, calls } = tokenHttp([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(ACCESS, REFRESH) },
    ]);

    const result = await exchangeCode(basecampOAuth, CLIENT, 'code-1', null, http);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.body).toBeUndefined();
    expect(call?.headers.authorization).toBeUndefined();
    expect(new URL(call?.url ?? '').origin + new URL(call?.url ?? '').pathname).toBe(TOKEN_URL);
    expect(Object.fromEntries(new URL(call?.url ?? '').searchParams)).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: redirectUri(basecampOAuth),
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(result).toEqual({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: new Date(NOW + 1209600 * 1000).toISOString(), // deux semaines
      scope: null,
      raw: { token_type: 'Bearer', expires_in: 1209600 },
    });
  });

  it('renouvelle avec le jeton de rafraîchissement, en paramètres d’adresse, et garde le nouveau', async () => {
    const { http, calls } = tokenHttp([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(NEXT_ACCESS, NEXT_REFRESH) },
    ]);

    const result = await refreshTokens(basecampOAuth, CLIENT, REFRESH, http);

    expect(calls[0]?.body).toBeUndefined();
    expect(Object.fromEntries(new URL(calls[0]?.url ?? '').searchParams)).toEqual({
      grant_type: 'refresh_token',
      refresh_token: REFRESH,
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(result.accessToken).toBe(NEXT_ACCESS);
    expect(result.refreshToken).toBe(NEXT_REFRESH);
    expect(result.expiresAt).toBe(new Date(NOW + 1209600 * 1000).toISOString());
  });

  it('garde l’ancien jeton de rafraîchissement si la réponse n’en porte pas', async () => {
    // La doc en montre un nouveau dans son exemple, sans dire que l'ancien cesse de valoir.
    const { http } = tokenHttp([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(NEXT_ACCESS) },
    ]);

    const result = await refreshTokens(basecampOAuth, CLIENT, REFRESH, http);

    expect(result.refreshToken).toBe(REFRESH);
  });
});

describe('basecampOAuth : toConfig', () => {
  it('lit authorization.json et garde le premier compte Basecamp (product bc3)', async () => {
    const { http, calls } = setupHttp([{ url: AUTHORIZATION_URL, json: authorization }]);

    const config = await basecampOAuth.toConfig(tokens(), {}, http);

    expect(config).toEqual({ accountId: '99999999', accountName: 'Acme SAS' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${ACCESS}`);
    // Basecamp exige un User-Agent qui dit qui appelle, et répond 400 sans lui.
    expect(calls[0]?.headers['user-agent']).toBe(USER_AGENT);
  });

  it('refuse une identité sans compte Basecamp (product bc3)', async () => {
    const onlyOld = { ...authorization, accounts: [authorization.accounts[0]] };
    const { http } = setupHttp([{ url: AUTHORIZATION_URL, json: onlyOld }]);

    await expect(basecampOAuth.toConfig(tokens(), {}, http)).rejects.toBeInstanceOf(
      ConnectorAuthError,
    );
  });

  it('rend une configuration que le schéma du connecteur accepte, jetons compris', async () => {
    const { http } = setupHttp([{ url: AUTHORIZATION_URL, json: authorization }]);
    const fields = await basecampOAuth.toConfig(tokens(), {}, http);

    // Dans l'ordre du socle : `toConfig` d'abord, puis les jetons, qu'il ne peut pas écraser.
    const parsed = basecampConnector.configSchema.safeParse({
      ...fields,
      authMode: 'oauth',
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: tokens().expiresAt,
    });

    expect(parsed.success).toBe(true);
  });

  it('n’appelle que Launchpad : un autre hôte serait refusé', async () => {
    const { http, calls } = setupHttp([{ url: AUTHORIZATION_URL, json: authorization }]);
    await basecampOAuth.toConfig(tokens(), {}, http);

    const hosts = new Set(calls.map((call) => new URL(call.url).host));
    expect([...hosts]).toEqual(basecampOAuth.setupHosts);
  });
});

describe('basecampOAuth : le déroulé du retour', () => {
  it('enchaîne l’échange, le choix du compte, la configuration et la vérification', async () => {
    // Comme /retour : un client par étape, chacun limité à ses hôtes, sur les mêmes fausses routes.
    const fetchImpl = fakeFetch([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(ACCESS, REFRESH) },
      { url: AUTHORIZATION_URL, json: authorization },
      { url: 'https://3.basecampapi.com/99999999/my/profile.json', json: profile },
    ]);
    const clientFor = (hosts: string[]) =>
      createConnectorHttp({ provider: 'basecamp', hosts, fetchImpl, sleep: async () => {} });

    const got = await exchangeCode(
      basecampOAuth,
      CLIENT,
      'code-1',
      null,
      clientFor([new URL(basecampOAuth.tokenUrl).host]),
    );
    const fields = await basecampOAuth.toConfig(got, {}, clientFor(basecampOAuth.setupHosts));
    const config = basecampConnector.configSchema.parse({
      ...fields,
      authMode: 'oauth',
      accessToken: got.accessToken,
      refreshToken: got.refreshToken,
      expiresAt: got.expiresAt,
    });
    const checked = await basecampConnector.verify(
      config,
      clientFor(basecampConnector.hosts(config)),
    );

    expect(checked).toEqual({ account: 'Acme SAS (Marie Durand)' });
    expect(fetchImpl.calls.map((call) => new URL(call.url).host)).toEqual([
      'launchpad.37signals.com',
      'launchpad.37signals.com',
      '3.basecampapi.com',
    ]);
    // Le jeton rendu par l'échange est celui que l'API de Basecamp reçoit.
    expect(fetchImpl.calls[2]?.headers.authorization).toBe(`Bearer ${ACCESS}`);
  });
});
