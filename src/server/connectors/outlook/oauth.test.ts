import { createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFetch } from '@/test/fake-fetch';
import { catalogItem } from '../catalog';
import { createConnectorHttp } from '../http';
import {
  authorizeUrl,
  exchangeCode,
  OAuthRefusedError,
  redirectUri,
  refreshTokens,
} from '../oauth';
import type { OAuthPending } from '../oauth-cookie';
import { outlookCatalog } from './catalog';
import { outlookConnector } from './connector';
import { outlookOAuth } from './oauth';

// Le socle OAuth importe `connections` (base de données) pour enregistrer les jetons : inutile ici.
vi.mock('../connections', () => ({ saveOAuthTokens: vi.fn() }));

const NOW = Date.UTC(2026, 9, 15, 10, 0, 0);
const CLIENT = {
  id: '11111111-2222-4333-8444-555555555555',
  secret: `s-${randomBytes(8).toString('hex')}`,
};
const TOKEN_URL = 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token';
const SCOPE = 'offline_access User.Read Mail.ReadWrite Calendars.ReadWrite';

// Des jetons générés à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const ACCESS = `eyJ.${randomBytes(12).toString('hex')}`;
const REFRESH = `0.A${randomBytes(12).toString('hex')}`;
const NEXT_ACCESS = `eyJ.${randomBytes(12).toString('hex')}`;
const NEXT_REFRESH = `0.A${randomBytes(12).toString('hex')}`;

// Forme de la réponse de https://learn.microsoft.com/en-us/graph/auth-v2-user (lue le 15/10/2026).
const tokenAnswer = (access: string, refresh?: string) => ({
  token_type: 'Bearer',
  scope: 'Mail.Read User.Read Calendars.Read',
  expires_in: 3736,
  ext_expires_in: 3736,
  access_token: access,
  ...(refresh ? { refresh_token: refresh } : {}),
});

const pending: OAuthPending = {
  provider: 'outlook',
  userId: 'u',
  tenantId: 't',
  state: 'etat-1',
  verifier: 'verificateur-0123456789-0123456789-0123456789',
  since: '30',
  preFields: {},
  reconnectId: null,
  createdAt: NOW,
};

function tokenHttp(routes: Parameters<typeof fakeFetch>[0]) {
  const fetchImpl = fakeFetch(routes);
  const http = createConnectorHttp({
    provider: 'outlook',
    hosts: [new URL(outlookOAuth.tokenUrl).host],
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
  vi.unstubAllEnvs();
});

describe('outlookOAuth : description', () => {
  it('déclare les adresses Microsoft du locataire « organizations », les droits en lecture et PKCE', () => {
    expect(outlookOAuth).toMatchObject({
      appKey: 'OUTLOOK',
      authorizeUrl: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize',
      tokenUrl: TOKEN_URL,
      scopes: ['offline_access', 'User.Read', 'Mail.ReadWrite', 'Calendars.ReadWrite'],
      pkce: true,
      clientAuth: 'body',
      preFields: [],
      setupHosts: [],
    });
    // L'échange se fait en formulaire (valeur par défaut du socle), le secret avec les paramètres.
    expect(outlookOAuth.tokenBody ?? 'form').toBe('form');
  });

  it('ne demande que la lecture du courrier et de l’agenda, avec PKCE S256', () => {
    const url = new URL(authorizeUrl(outlookOAuth, CLIENT, pending));

    expect(`${url.origin}${url.pathname}`).toBe(outlookOAuth.authorizeUrl);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT.id,
      redirect_uri: redirectUri(outlookOAuth),
      response_type: 'code',
      response_mode: 'query',
      state: 'etat-1',
      scope: SCOPE,
      code_challenge: createHash('sha256')
        .update(pending.verifier ?? '')
        .digest('base64url'),
      code_challenge_method: 'S256',
    });
    // Jamais prompt=consent : Microsoft bloque alors les utilisateurs même après l'accord de l'administrateur.
    expect(url.searchParams.has('prompt')).toBe(false);
    expect(redirectUri(outlookOAuth)).toMatch(/\/api\/v1\/connexions\/oauth\/outlook\/retour$/);
  });
});

describe('outlookOAuth : échange et renouvellement', () => {
  it('échange le code en formulaire, avec le vérificateur, les droits et le secret avec les paramètres', async () => {
    const { http, calls } = tokenHttp([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(ACCESS, REFRESH) },
    ]);

    const tokens = await exchangeCode(outlookOAuth, CLIENT, 'code-1', pending.verifier, http);

    expect(calls[0]?.headers['content-type']).toMatch(/^application\/x-www-form-urlencoded/);
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(calls[0]?.body).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: redirectUri(outlookOAuth),
      code_verifier: pending.verifier,
      scope: SCOPE,
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(tokens).toEqual({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: new Date(NOW + 3736 * 1000).toISOString(),
      scope: 'Mail.Read User.Read Calendars.Read',
      raw: {
        token_type: 'Bearer',
        scope: 'Mail.Read User.Read Calendars.Read',
        expires_in: 3736,
        ext_expires_in: 3736,
      },
    });
  });

  it('renouvelle avec les mêmes droits et garde le nouveau jeton de rafraîchissement', async () => {
    const { http, calls } = tokenHttp([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(NEXT_ACCESS, NEXT_REFRESH) },
    ]);

    const tokens = await refreshTokens(outlookOAuth, CLIENT, REFRESH, http);

    expect(calls[0]?.body).toEqual({
      grant_type: 'refresh_token',
      refresh_token: REFRESH,
      scope: SCOPE,
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(tokens.accessToken).toBe(NEXT_ACCESS);
    expect(tokens.refreshToken).toBe(NEXT_REFRESH);
    expect(tokens.expiresAt).toBe(new Date(NOW + 3736 * 1000).toISOString());
  });

  it('garde l’ancien jeton de rafraîchissement quand Microsoft n’en rend pas de nouveau', async () => {
    const { http } = tokenHttp([
      { method: 'POST', url: TOKEN_URL, json: tokenAnswer(NEXT_ACCESS) },
    ]);

    const tokens = await refreshTokens(outlookOAuth, CLIENT, REFRESH, http);

    expect(tokens.refreshToken).toBe(REFRESH);
  });
});

describe('outlookOAuth : accord de l’administrateur', () => {
  const consent = outlookOAuth.adminConsent;

  it('reconnaît les refus faute d’accord de l’administrateur', () => {
    const isConsentError = (error: string, description: string | null) =>
      consent?.isConsentError({ error, description });

    expect(isConsentError('consent_required', null)).toBe(true);
    expect(isConsentError('access_denied', 'AADSTS90094: Administrator consent is required.')).toBe(
      true,
    );
    expect(isConsentError('access_denied', 'AADSTS90095: Admin approval is required.')).toBe(true);
    expect(isConsentError('invalid_grant', 'AADSTS65001: The user has not consented.')).toBe(true);
  });

  it('ne prend pas pour un défaut d’accord un refus de l’utilisateur ou une autre erreur', () => {
    const isConsentError = (error: string, description: string | null) =>
      consent?.isConsentError({ error, description });

    expect(isConsentError('access_denied', 'AADSTS65004: The user declined to consent.')).toBe(
      false,
    );
    expect(isConsentError('access_denied', null)).toBe(false);
    expect(isConsentError('invalid_grant', 'AADSTS70008: The code has expired.')).toBe(false);
    expect(isConsentError('invalid_grant', 'AADSTS650017: autre code')).toBe(false);
  });

  it('donne le lien d’accord de l’administrateur, avec les droits déclarés dans l’inscription de l’appli', () => {
    const link = new URL(consent?.url(CLIENT.id, redirectUri(outlookOAuth)) ?? '');

    expect(`${link.origin}${link.pathname}`).toBe(
      'https://login.microsoftonline.com/organizations/v2.0/adminconsent',
    );
    expect(Object.fromEntries(link.searchParams)).toEqual({
      client_id: CLIENT.id,
      scope: 'https://graph.microsoft.com/.default',
      redirect_uri: redirectUri(outlookOAuth),
    });
  });

  it('signale à l’échange que l’administrateur doit donner son accord', async () => {
    const { http } = tokenHttp([
      {
        method: 'POST',
        url: TOKEN_URL,
        status: 400,
        json: {
          error: 'invalid_grant',
          error_description:
            'AADSTS65001: The user or administrator has not consented to use the application.',
        },
      },
    ]);

    const failure = await exchangeCode(
      outlookOAuth,
      CLIENT,
      'code-1',
      pending.verifier,
      http,
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(OAuthRefusedError);
    expect((failure as OAuthRefusedError).adminConsent).toBe(true);
    expect((failure as OAuthRefusedError).message).not.toContain('AADSTS');
  });

  it('refuse sans parler d’administrateur un code périmé', async () => {
    const { http } = tokenHttp([
      {
        method: 'POST',
        url: TOKEN_URL,
        status: 400,
        json: { error: 'invalid_grant', error_description: 'AADSTS70008: The code has expired.' },
      },
    ]);

    const failure = await exchangeCode(
      outlookOAuth,
      CLIENT,
      'code-1',
      pending.verifier,
      http,
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(OAuthRefusedError);
    expect((failure as OAuthRefusedError).adminConsent).toBe(false);
  });

  it('met le lien dans le catalogue seulement quand l’appli est configurée', () => {
    expect(catalogItem(outlookCatalog, outlookConnector).adminConsentUrl).toBeNull();

    vi.stubEnv('LEON_OAUTH_OUTLOOK_ID', CLIENT.id);
    vi.stubEnv('LEON_OAUTH_OUTLOOK_SECRET', CLIENT.secret);
    const item = catalogItem(outlookCatalog, outlookConnector);

    expect(item.oauthReady).toBe(true);
    expect(item.adminConsentUrl).toBe(consent?.url(CLIENT.id, redirectUri(outlookOAuth)));
    expect(JSON.stringify(item)).not.toContain(CLIENT.secret);
  });
});

describe('outlookOAuth : toConfig', () => {
  it('ne rend aucun champ propre à Outlook et n’appelle pas Microsoft', async () => {
    const fetchImpl = fakeFetch([]);
    const http = createConnectorHttp({
      provider: 'outlook',
      hosts: outlookOAuth.setupHosts,
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

    await expect(outlookOAuth.toConfig(tokens, {}, http)).resolves.toEqual({});
    expect(fetchImpl.calls).toHaveLength(0);
  });
});
