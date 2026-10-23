import { createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeRoute, fakeFetch } from '@/test/fake-fetch';
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
import type { OAuthTokens } from '../types';
import { airtableConnector } from './connector';
import tokenFirst from './fixtures/oauth-token.json';
import tokenRefreshed from './fixtures/oauth-token-refresh.json';
import { airtableOAuth } from './oauth';

// Le bouton « Se connecter avec Airtable » : la description OAuth et la conversion des jetons en
// configuration. Les formes de réponse viennent de la doc lue le 15/10/2026, données inventées.

// Le socle importe la base par `connections` : inutile ici.
vi.mock('../connections', () => ({ saveOAuthTokens: vi.fn() }));

const NOW = Date.UTC(2026, 10, 15, 9, 0, 0);
const HOUR = 60 * 60_000;
// Fabriqués à chaque lancement : aucun secret dans le dépôt.
const CLIENT = {
  id: `client-${randomBytes(4).toString('hex')}`,
  secret: randomBytes(16).toString('hex'),
};
const TOKEN_URL = 'https://airtable.com/oauth2/v1/token';
const VERIFIER = 'verificateur-de-test_0123456789.abcdefghijklmnopqrstuvwxyz';

const pending: OAuthPending = {
  provider: 'airtable',
  userId: 'u',
  tenantId: 't',
  state: 'etat-1',
  verifier: VERIFIER,
  since: '30',
  preFields: {},
  reconnectId: null,
  createdAt: NOW,
};

const tokenRoute = (json: unknown, status = 200): FakeRoute => ({
  method: 'POST',
  url: TOKEN_URL,
  status,
  json,
});

const basic = `Basic ${Buffer.from(`${CLIENT.id}:${CLIENT.secret}`).toString('base64')}`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('airtable : description du bouton', () => {
  it('est portée par le connecteur', () => {
    expect(airtableConnector.oauth).toBe(airtableOAuth);
  });

  it('suit la doc : PKCE, secret en Basic, formulaire, lecture et écriture des enregistrements, rien à saisir avant le clic', () => {
    expect(airtableOAuth).toMatchObject({
      appKey: 'AIRTABLE',
      authorizeUrl: 'https://airtable.com/oauth2/v1/authorize',
      tokenUrl: TOKEN_URL,
      scopes: [
        'data.records:read',
        'schema.bases:read',
        'data.recordComments:read',
        'data.records:write',
        'data.recordComments:write',
      ],
      pkce: true,
      clientAuth: 'basic',
      tokenBody: 'form',
      preFields: [],
      setupHosts: [],
    });
    expect(airtableOAuth.scopeSeparator ?? ' ').toBe(' ');
    expect(airtableOAuth.extraAuthorizeParams).toBeUndefined();
    expect(airtableOAuth.extraTokenParams).toBeUndefined();
    expect(airtableOAuth.adminConsent).toBeUndefined();
  });

  it('écrit seulement les enregistrements et leurs commentaires, jamais la structure des bases', () => {
    const writes = airtableOAuth.scopes.filter((scope) => !scope.endsWith(':read'));
    expect(writes).toEqual(['data.records:write', 'data.recordComments:write']);
  });

  it('nomme chaque champ avant le clic dans le schéma du connecteur', () => {
    const shape = (airtableConnector.configSchema as unknown as { shape: object }).shape;
    for (const name of airtableOAuth.preFields) expect(shape).toHaveProperty(name);
  });

  it('construit l’adresse d’autorisation : droits séparés par des espaces, défi PKCE S256, state', () => {
    const url = new URL(authorizeUrl(airtableOAuth, CLIENT, pending));

    expect(`${url.origin}${url.pathname}`).toBe('https://airtable.com/oauth2/v1/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT.id,
      redirect_uri: redirectUri(airtableOAuth),
      response_type: 'code',
      scope:
        'data.records:read schema.bases:read data.recordComments:read data.records:write data.recordComments:write',
      state: 'etat-1',
      code_challenge: createHash('sha256').update(VERIFIER).digest('base64url'),
      code_challenge_method: 'S256',
    });
    expect(redirectUri(airtableOAuth)).toMatch(/\/api\/v1\/connexions\/oauth\/airtable\/retour$/);
    expect(url.toString()).not.toContain(CLIENT.secret);
  });

  it('a un hôte de jeton que le connecteur appelle aussi pour les données', () => {
    expect(new URL(airtableOAuth.tokenUrl).host).toBe('airtable.com');
    expect(airtableOAuth.setupHosts).toEqual([]);
    expect(
      airtableConnector.hosts(
        airtableConnector.configSchema.parse({ authMode: 'oauth', accessToken: 'a' }),
      ),
    ).toEqual(['api.airtable.com']);
  });
});

describe('airtable : échange du code et renouvellement', () => {
  it('envoie le code en formulaire, avec le secret en Basic et sans client_id ni secret dans le corps', async () => {
    const fetchImpl = fakeFetch([tokenRoute(tokenFirst)]);
    const http = tokenHttp(airtableOAuth, 'airtable', fetchImpl);

    const tokens = await exchangeCode(airtableOAuth, CLIENT, 'code-1', VERIFIER, http);

    const [call] = fetchImpl.calls;
    expect(call?.url).toBe(TOKEN_URL);
    expect(call?.headers['content-type']).toMatch(/^application\/x-www-form-urlencoded/);
    expect(call?.headers.authorization).toBe(basic);
    expect(call?.body).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: redirectUri(airtableOAuth),
      code_verifier: VERIFIER,
    });
    expect(tokens).toEqual({
      accessToken: tokenFirst.access_token,
      refreshToken: tokenFirst.refresh_token,
      expiresAt: new Date(NOW + HOUR).toISOString(),
      scope: tokenFirst.scope,
      // Privée des jetons ; reste ce que l'éditeur dit en plus.
      raw: {
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_expires_in: 5_184_000,
        scope: tokenFirst.scope,
      },
    });
  });

  it('renouvelle avec le jeton de rafraîchissement, en Basic, et remplace les deux jetons', async () => {
    const fetchImpl = fakeFetch([tokenRoute(tokenRefreshed)]);
    const http = tokenHttp(airtableOAuth, 'airtable', fetchImpl);

    const tokens = await refreshTokens(airtableOAuth, CLIENT, tokenFirst.refresh_token, http);

    const [call] = fetchImpl.calls;
    expect(call?.headers.authorization).toBe(basic);
    expect(call?.body).toEqual({
      grant_type: 'refresh_token',
      refresh_token: tokenFirst.refresh_token,
    });
    // Airtable invalide l'ancien jeton de rafraîchissement : le nouveau est gardé.
    expect(tokens.accessToken).toBe(tokenRefreshed.access_token);
    expect(tokens.refreshToken).toBe(tokenRefreshed.refresh_token);
    expect(tokens.expiresAt).toBe(new Date(NOW + HOUR).toISOString());
  });

  it.each([
    [400, { error: 'invalid_grant', error_description: 'Code déjà utilisé' }],
    [401, { error: 'invalid_client' }],
  ])('prend un refus de l’éditeur (%i) pour un refus d’autorisation', async (status, json) => {
    const fetchImpl = fakeFetch([tokenRoute(json, status), tokenRoute(json, status)]);
    const http = tokenHttp(airtableOAuth, 'airtable', fetchImpl);

    await expect(
      exchangeCode(airtableOAuth, CLIENT, 'code-1', VERIFIER, http),
    ).rejects.toBeInstanceOf(OAuthRefusedError);
    await expect(
      refreshTokens(airtableOAuth, CLIENT, tokenFirst.refresh_token, http),
    ).rejects.toBeInstanceOf(OAuthRefusedError);
  });

  it('laisse remonter un 409 (renouvellement trop rapproché) : ce n’est pas un refus', async () => {
    const fetchImpl = fakeFetch([tokenRoute({ error: 'conflict' }, 409)]);
    const http = tokenHttp(airtableOAuth, 'airtable', fetchImpl);

    const failure = await refreshTokens(
      airtableOAuth,
      CLIENT,
      tokenFirst.refresh_token,
      http,
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(OAuthRefusedError);
  });
});

describe('airtable : conversion des jetons en configuration', () => {
  const tokens: OAuthTokens = {
    accessToken: tokenFirst.access_token,
    refreshToken: tokenFirst.refresh_token,
    expiresAt: new Date(NOW + HOUR).toISOString(),
    scope: tokenFirst.scope,
    raw: { token_type: 'Bearer' },
  };
  // setupHosts est vide : le client ne laisserait passer aucun appel.
  const silent = () => {
    const fetchImpl = fakeFetch([]);
    const http = createConnectorHttp({ provider: 'airtable', hosts: [], fetchImpl });
    return { http, fetchImpl };
  };

  it('prend aucune base pour « toutes les bases autorisées »', async () => {
    const { http } = silent();

    expect(await airtableOAuth.toConfig(tokens, { bases: [] }, http)).toEqual({ bases: [] });
    expect(await airtableOAuth.toConfig(tokens, {}, http)).toEqual({ bases: [] });
  });

  it('donne, avec les jetons, une configuration que le schéma accepte (comme le fait /retour)', async () => {
    const { http } = silent();
    const fields = await airtableOAuth.toConfig(tokens, { bases: [] }, http);

    const parsed = airtableConnector.configSchema.safeParse({
      ...fields,
      authMode: 'oauth',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ authMode: 'oauth', bases: [] });
  });
});
