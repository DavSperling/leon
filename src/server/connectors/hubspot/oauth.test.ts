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
  tokenHttp,
} from '../oauth';
import type { OAuthPending } from '../oauth-cookie';
import { hubspotOAuth } from './oauth';

// Le socle OAuth importe `connections` (base de données) pour enregistrer les jetons : inutile ici.
vi.mock('../connections', () => ({ saveOAuthTokens: vi.fn() }));

const NOW = Date.UTC(2026, 10, 2, 9, 0, 0);
const CLIENT = { id: 'id-appli-hubspot', secret: `secret-${randomBytes(8).toString('hex')}` };
const TOKEN_URL = 'https://api.hubapi.com/oauth/v3/token';

// Des jetons générés à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const ACCESS = `CJ${randomBytes(24).toString('hex')}`;
const REFRESH = `eu1-${randomBytes(12).toString('hex')}`;
const NEXT_ACCESS = `CJ${randomBytes(24).toString('hex')}`;
const NEXT_REFRESH = `eu1-${randomBytes(12).toString('hex')}`;

const SCOPES = [
  'oauth',
  'crm.objects.contacts.read',
  'crm.objects.companies.read',
  'crm.objects.deals.read',
  'crm.objects.owners.read',
  'sales-email-read',
  'crm.objects.contacts.write',
  'crm.objects.companies.write',
  'crm.objects.deals.write',
];

// Forme de la réponse de https://developers.hubspot.com/docs/api-reference/legacy/authentication/
// manage-oauth-tokens (lue le 15/10/2026) : token_type, access_token, refresh_token, expires_in (1800),
// plus hub_id et scopes (un tableau) dans l'exemple du guide d'autorisation.
const tokenAnswer = (access: string, refresh: string) => ({
  token_type: 'bearer',
  access_token: access,
  refresh_token: refresh,
  expires_in: 1800,
  hub_id: 12345678,
  scopes: SCOPES,
});

const pending: OAuthPending = {
  provider: 'hubspot',
  userId: 'u',
  tenantId: 't',
  state: 'etat-1',
  verifier: null,
  since: '30',
  preFields: {},
  reconnectId: null,
  createdAt: NOW,
};

function http(routes: Parameters<typeof fakeFetch>[0]) {
  const fetchImpl = fakeFetch(routes);
  return { http: tokenHttp(hubspotOAuth, 'hubspot', fetchImpl), calls: fetchImpl.calls };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('hubspotOAuth : description', () => {
  it('déclare les adresses de HubSpot, les droits de lecture, sans PKCE, secret avec les paramètres', () => {
    expect(hubspotOAuth).toMatchObject({
      appKey: 'HUBSPOT',
      authorizeUrl: 'https://app.hubspot.com/oauth/authorize',
      tokenUrl: TOKEN_URL,
      scopes: SCOPES,
      pkce: false,
      clientAuth: 'body',
      preFields: [],
      setupHosts: [],
    });
    // Échange en formulaire (valeur par défaut du socle), sans paramètre de plus.
    expect(hubspotOAuth.tokenBody ?? 'form').toBe('form');
    expect(hubspotOAuth.extraAuthorizeParams).toBeUndefined();
    expect(hubspotOAuth.extraTokenParams).toBeUndefined();
    expect(hubspotOAuth.adminConsent).toBeUndefined();
  });

  it('ne demande en écriture que les contacts, les entreprises et les affaires', () => {
    const writes = hubspotOAuth.scopes.filter((s) => s !== 'oauth' && !/(\.read|-read)$/.test(s));
    expect(writes).toEqual([
      'crm.objects.contacts.write',
      'crm.objects.companies.write',
      'crm.objects.deals.write',
    ]);
  });

  it('envoie vers HubSpot avec les droits séparés par des espaces et sans PKCE', () => {
    const url = new URL(authorizeUrl(hubspotOAuth, CLIENT, pending));

    expect(`${url.origin}${url.pathname}`).toBe('https://app.hubspot.com/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT.id,
      redirect_uri: redirectUri(hubspotOAuth),
      response_type: 'code',
      state: 'etat-1',
      scope: SCOPES.join(' '),
    });
    expect(redirectUri(hubspotOAuth)).toMatch(/\/api\/v1\/connexions\/oauth\/hubspot\/retour$/);
  });
});

describe('hubspotOAuth : échange et renouvellement', () => {
  it('échange le code en formulaire, avec le secret dans les paramètres et sans Basic', async () => {
    const { http: client, calls } = http([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(ACCESS, REFRESH) },
    ]);

    const tokens = await exchangeCode(hubspotOAuth, CLIENT, 'code-1', null, client);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers['content-type']).toMatch(/^application\/x-www-form-urlencoded/);
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(calls[0]?.body).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: redirectUri(hubspotOAuth),
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(tokens).toEqual({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: new Date(NOW + 1800 * 1000).toISOString(), // jeton d'accès de 30 minutes
      scope: null, // HubSpot rend « scopes » (un tableau), pas « scope »
      raw: { token_type: 'bearer', expires_in: 1800, hub_id: 12345678, scopes: SCOPES },
    });
  });

  it('renouvelle avec le jeton de rafraîchissement et prend le nouveau s’il est rendu', async () => {
    const { http: client, calls } = http([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(NEXT_ACCESS, NEXT_REFRESH) },
    ]);

    const tokens = await refreshTokens(hubspotOAuth, CLIENT, REFRESH, client);

    // La doc n'exige pas d'adresse de retour au renouvellement.
    expect(calls[0]?.body).toEqual({
      grant_type: 'refresh_token',
      refresh_token: REFRESH,
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(tokens.accessToken).toBe(NEXT_ACCESS);
    expect(tokens.refreshToken).toBe(NEXT_REFRESH);
    expect(tokens.expiresAt).toBe(new Date(NOW + 1800 * 1000).toISOString());
  });

  it('garde l’ancien jeton de rafraîchissement quand la réponse n’en rend pas', async () => {
    const { refresh_token: _omitted, ...answer } = tokenAnswer(NEXT_ACCESS, NEXT_REFRESH);
    const { http: client } = http([{ method: 'POST', url: TOKEN_URL, json: answer }]);

    const tokens = await refreshTokens(hubspotOAuth, CLIENT, REFRESH, client);

    expect(tokens.refreshToken).toBe(REFRESH);
  });

  it('prend un jeton de rafraîchissement révoqué pour un refus, sans reprendre le message', async () => {
    // Forme d'erreur de la doc : conforme à la RFC 6749, avec status et message en plus.
    const refused = {
      error: 'invalid_grant',
      error_description: 'refresh token is invalid, expired or revoked',
      status: 'BAD_REFRESH_TOKEN',
      message: 'refresh token is invalid, expired or revoked',
    };
    const { http: client } = http([{ method: 'POST', url: TOKEN_URL, status: 400, json: refused }]);

    const error = await refreshTokens(hubspotOAuth, CLIENT, REFRESH, client).catch((e) => e);

    expect(error).toBeInstanceOf(OAuthRefusedError);
    expect(error.adminConsent).toBe(false);
    expect(error.message).not.toMatch(/revoked/);
  });
});

describe('hubspotOAuth : toConfig', () => {
  it('ne rend aucun champ propre à HubSpot et n’appelle pas l’éditeur', async () => {
    const fetchImpl = fakeFetch([]);
    const client = createConnectorHttp({
      provider: 'hubspot',
      hosts: hubspotOAuth.setupHosts,
      fetchImpl,
      sleep: async () => {},
    });
    const tokens = {
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: null,
      scope: null,
      raw: { hub_id: 12345678, scopes: SCOPES },
    };

    await expect(hubspotOAuth.toConfig(tokens, {}, client)).resolves.toEqual({});
    expect(fetchImpl.calls).toHaveLength(0);
  });
});
