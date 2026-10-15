import { randomBytes } from 'node:crypto';
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
import { helpscoutOAuth } from './oauth';

// Le socle OAuth importe `connections` (base de données) pour enregistrer les jetons : inutile ici.
vi.mock('../connections', () => ({ saveOAuthTokens: vi.fn() }));

const NOW = Date.UTC(2026, 9, 15, 10, 0, 0);
const CLIENT = {
  id: 'identifiant-appli-helpscout',
  secret: `secret-${randomBytes(8).toString('hex')}`,
};
const TOKEN_URL = 'https://api.helpscout.net/v2/oauth2/token';

// Des jetons générés à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const ACCESS = `acces-${randomBytes(12).toString('hex')}`;
const REFRESH = `rafraichir-${randomBytes(12).toString('hex')}`;
const NEXT_ACCESS = `acces-${randomBytes(12).toString('hex')}`;
const NEXT_REFRESH = `rafraichir-${randomBytes(12).toString('hex')}`;

// Forme de la réponse décrite par
// https://developer.helpscout.com/mailbox-api/overview/authentication/ (lue le 15/10/2026) :
// refresh_token, token_type « bearer », access_token et expires_in 172800 (deux jours).
const tokenAnswer = (access: string, refresh: string) => ({
  refresh_token: refresh,
  token_type: 'bearer',
  access_token: access,
  expires_in: 172800,
});

const pending: OAuthPending = {
  provider: 'helpscout',
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
    provider: 'helpscout',
    hosts: [new URL(helpscoutOAuth.tokenUrl).host],
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

describe('helpscoutOAuth : description', () => {
  it('déclare les adresses de Help Scout, aucun droit, pas de PKCE et le secret avec les paramètres', () => {
    expect(helpscoutOAuth).toMatchObject({
      appKey: 'HELPSCOUT',
      authorizeUrl: 'https://secure.helpscout.net/authentication/authorizeClientApplication',
      tokenUrl: TOKEN_URL,
      scopes: [],
      pkce: false,
      clientAuth: 'body',
      preFields: [],
      setupHosts: [],
    });
    // L'échange se fait en formulaire (valeur par défaut du socle, forme des exemples de la doc).
    expect(helpscoutOAuth.tokenBody ?? 'form').toBe('form');
    expect(helpscoutOAuth.extraAuthorizeParams).toBeUndefined();
    expect(helpscoutOAuth.extraTokenParams).toBeUndefined();
    expect(helpscoutOAuth.adminConsent).toBeUndefined();
  });

  it('envoie l’identifiant de l’appli et le state, sans droit ni PKCE', () => {
    const url = new URL(authorizeUrl(helpscoutOAuth, CLIENT, pending));

    expect(`${url.origin}${url.pathname}`).toBe(
      'https://secure.helpscout.net/authentication/authorizeClientApplication',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT.id,
      redirect_uri: redirectUri(helpscoutOAuth),
      response_type: 'code',
      state: 'etat-1',
    });
    expect(url.searchParams.has('scope')).toBe(false);
    expect(url.searchParams.has('code_challenge')).toBe(false);
    expect(redirectUri(helpscoutOAuth)).toMatch(/\/api\/v1\/connexions\/oauth\/helpscout\/retour$/);
  });
});

describe('helpscoutOAuth : échange et renouvellement', () => {
  it('échange le code en formulaire, le secret avec les paramètres, sans vérificateur', async () => {
    const { http, calls } = tokenHttp([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(ACCESS, REFRESH) },
    ]);

    const tokens = await exchangeCode(helpscoutOAuth, CLIENT, 'code-1', null, http);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers['content-type']).toMatch(/^application\/x-www-form-urlencoded/);
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(calls[0]?.body).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: redirectUri(helpscoutOAuth),
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(tokens).toEqual({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: new Date(NOW + 172800 * 1000).toISOString(), // jeton d'accès de deux jours
      scope: null,
      raw: { token_type: 'bearer', expires_in: 172800 },
    });
  });

  it('renouvelle avec le jeton de rafraîchissement et garde le nouveau', async () => {
    const { http, calls } = tokenHttp([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(NEXT_ACCESS, NEXT_REFRESH) },
    ]);

    const tokens = await refreshTokens(helpscoutOAuth, CLIENT, REFRESH, http);

    expect(calls[0]?.body).toEqual({
      grant_type: 'refresh_token',
      refresh_token: REFRESH,
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(tokens.accessToken).toBe(NEXT_ACCESS);
    expect(tokens.refreshToken).toBe(NEXT_REFRESH);
    expect(tokens.expiresAt).toBe(new Date(NOW + 172800 * 1000).toISOString());
  });

  it('garde l’ancien jeton de rafraîchissement quand la réponse n’en porte pas', async () => {
    const { http } = tokenHttp([
      {
        method: 'POST',
        url: TOKEN_URL,
        json: { token_type: 'bearer', access_token: NEXT_ACCESS, expires_in: 172800 },
      },
    ]);

    const tokens = await refreshTokens(helpscoutOAuth, CLIENT, REFRESH, http);

    expect(tokens.refreshToken).toBe(REFRESH);
  });

  it.each([400, 401])(
    'un refus (%s) qui porte `error` est une autorisation refusée',
    async (status) => {
      const { http } = tokenHttp([
        { method: 'POST', url: TOKEN_URL, status, json: { error: 'invalid_grant' } },
      ]);

      const failure = await refreshTokens(helpscoutOAuth, CLIENT, REFRESH, http).catch(
        (error: unknown) => error,
      );

      expect(failure).toBeInstanceOf(OAuthRefusedError);
      expect((failure as OAuthRefusedError).adminConsent).toBe(false);
    },
  );
});

describe('helpscoutOAuth : toConfig', () => {
  it('ne rend aucun champ propre à Help Scout et n’appelle pas l’éditeur', async () => {
    const fetchImpl = fakeFetch([]);
    const http = createConnectorHttp({
      provider: 'helpscout',
      hosts: helpscoutOAuth.setupHosts,
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

    await expect(helpscoutOAuth.toConfig(tokens, {}, http)).resolves.toEqual({});
    expect(fetchImpl.calls).toHaveLength(0);
  });
});
