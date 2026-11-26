import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fakeFetch } from '@/test/fake-fetch';
import { driveConnector } from './drive/connector';
import { gmailConnector } from './gmail/connector';
import { GoogleConfigSchema, googleHttp } from './google';
import { createConnectorHttp } from './http';
import { authorizeUrl, exchangeCode, redirectUri, refreshTokens } from './oauth';
import type { OAuthPending } from './oauth-cookie';

// Le socle OAuth importe `connections` (base de données) pour enregistrer les jetons : inutile ici.
vi.mock('./connections', () => ({ saveOAuthTokens: vi.fn() }));

const CLIENT = {
  id: 'id-essai.apps.googleusercontent.com',
  secret: `s-${randomBytes(8).toString('hex')}`,
};
// Des jetons générés à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const ACCESS = `ya29.${randomBytes(12).toString('hex')}`;
const REFRESH = `1//${randomBytes(12).toString('hex')}`;
const NEXT_ACCESS = `ya29.${randomBytes(12).toString('hex')}`;
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const pending: OAuthPending = {
  provider: 'gmail',
  userId: 'u',
  tenantId: 't',
  state: 'etat-1',
  verifier: 'verificateur-0123456789-0123456789-0123456789',
  since: '30',
  preFields: {},
  reconnectId: null,
  createdAt: Date.UTC(2026, 10, 26),
};

const spec = gmailConnector.oauth;
if (!spec) throw new Error('Gmail sans bouton');

function tokenHttp(routes: Parameters<typeof fakeFetch>[0]) {
  const fetchImpl = fakeFetch(routes);
  const http = createConnectorHttp({
    provider: 'gmail',
    hosts: ['oauth2.googleapis.com'],
    fetchImpl,
  });
  return { http, calls: fetchImpl.calls };
}

describe('appli Google de Leon', () => {
  it('demande un seul droit en lecture par outil, hors connexion, avec un nouvel accord et le choix du compte', () => {
    const url = new URL(authorizeUrl(spec, CLIENT, pending));

    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT.id,
      redirect_uri: redirectUri(spec),
      response_type: 'code',
      state: 'etat-1',
      scope: GMAIL_SCOPE,
      code_challenge: createHash('sha256')
        .update(pending.verifier ?? '')
        .digest('base64url'),
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent select_account',
    });
    // Une seule adresse de retour pour Gmail et Drive : celle déclarée chez Google.
    expect(redirectUri(spec)).toMatch(/\/api\/v1\/connexions\/oauth\/google\/retour$/);
    expect(driveConnector.oauth).toMatchObject({
      appKey: 'GOOGLE',
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
  });

  it('échange le code avec le secret dans le formulaire, puis renouvelle en gardant le jeton de rafraîchissement', async () => {
    const first = tokenHttp([
      {
        method: 'POST',
        url: TOKEN_URL,
        json: {
          access_token: ACCESS,
          expires_in: 3599,
          refresh_token: REFRESH,
          scope: GMAIL_SCOPE,
          token_type: 'Bearer',
        },
      },
    ]);
    const tokens = await exchangeCode(spec, CLIENT, 'code-1', pending.verifier, first.http);
    expect(first.calls[0]?.body).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: redirectUri(spec),
      code_verifier: pending.verifier,
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(tokens).toMatchObject({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      scope: GMAIL_SCOPE,
    });

    // Google ne rend pas de nouveau jeton de rafraîchissement au renouvellement.
    const again = tokenHttp([
      {
        method: 'POST',
        url: TOKEN_URL,
        json: {
          access_token: NEXT_ACCESS,
          expires_in: 3599,
          scope: GMAIL_SCOPE,
          token_type: 'Bearer',
        },
      },
    ]);
    const renewed = await refreshTokens(spec, CLIENT, REFRESH, again.http);
    expect(again.calls[0]?.body).toEqual({
      grant_type: 'refresh_token',
      refresh_token: REFRESH,
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(renewed).toMatchObject({ accessToken: NEXT_ACCESS, refreshToken: REFRESH });
  });

  it('accepte une connexion par Pipedream ou par notre appli, jamais à moitié remplie', () => {
    const accepts = (value: unknown) => GoogleConfigSchema.safeParse(value).success;
    const pipedream = { authMode: 'pipedream', externalUserId: 'leon-u1', accountId: 'apn_abc123' };
    expect(accepts(pipedream)).toBe(true);
    expect(accepts({ authMode: 'oauth', accessToken: ACCESS, refreshToken: REFRESH })).toBe(true);
    expect(accepts({ ...pipedream, authMode: 'oauth' })).toBe(false);
    expect(accepts({ authMode: 'pipedream', externalUserId: 'leon-u1' })).toBe(false);
    expect(accepts({ ...pipedream, accountId: 'pas-un-compte' })).toBe(false);
    expect(accepts({ authMode: 'key', accessToken: ACCESS })).toBe(false);
  });

  it('met le jeton dans chaque requête par notre appli, rien par Pipedream (son proxy l’ajoute)', async () => {
    const route = { url: 'https://gmail.googleapis.com/gmail/v1/users/me/profile', json: {} };
    const fetchImpl = fakeFetch([route, route]);
    const http = createConnectorHttp({
      provider: 'gmail',
      hosts: ['gmail.googleapis.com'],
      fetchImpl,
    });
    const any = z.unknown();

    await googleHttp({ authMode: 'oauth', accessToken: ACCESS }, http).json(
      { url: route.url },
      any,
    );
    const pipedream = { authMode: 'pipedream', externalUserId: 'u', accountId: 'apn_1' } as const;
    await googleHttp(pipedream, http).json({ url: route.url }, any);

    expect(fetchImpl.calls[0]?.headers.authorization).toBe(`Bearer ${ACCESS}`);
    expect(fetchImpl.calls[1]?.headers.authorization).toBeUndefined();
  });
});
