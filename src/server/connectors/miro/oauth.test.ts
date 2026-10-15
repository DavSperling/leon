import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
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
import { miroConnector } from './connector';
import tokenFirst from './fixtures/oauth-token.json';
import tokenRefreshed from './fixtures/oauth-token-refresh.json';
import { miroOAuth } from './oauth';

// Le bouton « Se connecter avec Miro » : la description OAuth, la conversion des jetons en
// configuration, et la configuration (un outil sans clé collée).

// Le socle importe la base par `connections` : inutile ici.
vi.mock('../connections', () => ({ saveOAuthTokens: vi.fn() }));

// Fabriqués à chaque lancement : aucun secret dans le dépôt.
const CLIENT = {
  id: `client-${randomBytes(4).toString('hex')}`,
  secret: randomBytes(16).toString('hex'),
};
const ACCESS = `acces-${randomBytes(12).toString('hex')}`;
const REFRESH = `rafraichir-${randomBytes(12).toString('hex')}`;
const TOKEN_URL = 'https://api.miro.com/v1/oauth/token';

const OAUTH_CONFIG = {
  authMode: 'oauth',
  accessToken: ACCESS,
  refreshToken: REFRESH,
  expiresAt: '2026-10-16T10:00:00.000Z',
  teamId: '3074457362577833142',
};

const pending: OAuthPending = {
  provider: 'miro',
  userId: 'u',
  tenantId: 't',
  state: 'etat-1',
  verifier: null,
  since: '30',
  preFields: {},
  reconnectId: null,
  createdAt: Date.now(),
};

const tokenRoute = (json: unknown, status = 200): FakeRoute => ({
  method: 'POST',
  url: TOKEN_URL,
  status,
  json,
});

// Ce que le socle rend de la réponse de jeton : privée des deux jetons.
const { access_token: _access, refresh_token: _refresh, ...RAW } = tokenFirst;

const tokens = (raw: Record<string, unknown>): OAuthTokens => ({
  accessToken: ACCESS,
  refreshToken: REFRESH,
  expiresAt: null,
  scope: 'boards:read',
  raw,
});

describe('description OAuth', () => {
  it('suit la doc : adresses de Miro, tout en paramètres d’adresse, aucun droit ni PKCE', () => {
    expect(miroOAuth).toMatchObject({
      appKey: 'MIRO',
      authorizeUrl: 'https://miro.com/oauth/authorize',
      tokenUrl: TOKEN_URL,
      scopes: [],
      pkce: false,
      clientAuth: 'body',
      tokenBody: 'query',
      preFields: [],
      setupHosts: [],
    });
    expect(miroConnector.oauth).toBe(miroOAuth);
  });

  it('a pour seul hôte celui des jetons, que le connecteur appelle aussi', () => {
    const config = miroConnector.configSchema.parse(OAUTH_CONFIG);
    expect(new URL(miroOAuth.tokenUrl).host).toBe('api.miro.com');
    expect(miroConnector.hosts(config)).toEqual(['api.miro.com']);
  });

  it('construit l’adresse d’autorisation avec le state, sans paramètre de droits ni défi PKCE', () => {
    const url = new URL(authorizeUrl(miroOAuth, CLIENT, pending));

    expect(`${url.origin}${url.pathname}`).toBe('https://miro.com/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT.id,
      redirect_uri: redirectUri(miroOAuth),
      response_type: 'code',
      state: 'etat-1',
    });
    expect(redirectUri(miroOAuth)).toMatch(/\/api\/v1\/connexions\/oauth\/miro\/retour$/);
  });
});

describe('échange du code et renouvellement', () => {
  it('envoie le code, l’identifiant et le secret en paramètres d’adresse, sans corps', async () => {
    const fetchImpl = fakeFetch([tokenRoute(tokenFirst)]);

    const result = await exchangeCode(
      miroOAuth,
      CLIENT,
      'code-1',
      null,
      tokenHttp(miroOAuth, 'miro', fetchImpl),
    );

    const [call] = fetchImpl.calls;
    expect(call?.method).toBe('POST');
    expect(call?.body).toBeUndefined();
    expect(call?.headers.authorization).toBeUndefined();
    expect(Object.fromEntries(new URL(call?.url ?? '').searchParams)).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: redirectUri(miroOAuth),
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(result.accessToken).toBe(tokenFirst.access_token);
    expect(result.refreshToken).toBe(tokenFirst.refresh_token);
    expect(result.scope).toBe('boards:read');
    expect(Date.parse(result.expiresAt ?? '') - Date.now()).toBeGreaterThan(3500_000);
    expect(result.raw).toMatchObject({ team_id: tokenFirst.team_id, user_id: tokenFirst.user_id });
    expect(result.raw).not.toHaveProperty('access_token');
    expect(result.raw).not.toHaveProperty('refresh_token');
  });

  it('renouvelle avec le jeton de rafraîchissement et garde le nouveau, qui tourne', async () => {
    const fetchImpl = fakeFetch([tokenRoute(tokenRefreshed)]);

    const result = await refreshTokens(
      miroOAuth,
      CLIENT,
      REFRESH,
      tokenHttp(miroOAuth, 'miro', fetchImpl),
    );

    const params = Object.fromEntries(new URL(fetchImpl.calls[0]?.url ?? '').searchParams);
    expect(params).toEqual({
      grant_type: 'refresh_token',
      refresh_token: REFRESH,
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(result.accessToken).toBe(tokenRefreshed.access_token);
    expect(result.refreshToken).toBe(tokenRefreshed.refresh_token);
    expect(result.expiresAt).not.toBeNull();
  });

  // Ce test ne dit rien de ce que Miro envoie : la forme { error, error_description } est celle que
  // le socle sait lire (RFC 6749), pas celle de la doc Miro (voir plus bas).
  it("lit un refus au format RFC 6749 ({ error: 'invalid_grant' }) sans reprendre son texte", async () => {
    const refusal = {
      error: 'invalid_grant',
      error_description: `Le jeton ${REFRESH} est périmé.`,
    };
    const fetchImpl = fakeFetch([tokenRoute(refusal, 400)]);

    const failure = await refreshTokens(
      miroOAuth,
      CLIENT,
      REFRESH,
      tokenHttp(miroOAuth, 'miro', fetchImpl),
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(OAuthRefusedError);
    expect((failure as Error).message).not.toContain(REFRESH);
  });

  // La forme que la doc Miro décrit (docs/troubleshooting-oauth20) pour un code invalide et pour
  // une adresse de retour qui ne correspond pas : un 401 { status, code: 'oauthError', message,
  // type }, sans champ `error`. Le socle ne compte pas encore comme refus une réponse sans `error` :
  // il lève ConnectorHttpError « Réponse inattendue », donc /retour répond 'indisponible' au lieu de
  // 'refuse', et un renouvellement forcé met la connexion en 'error' (nouvel essai chaque heure) au
  // lieu de 'auth_error' (« Reconnectez Miro »). Les tests « actuel » gardent ce comportement écrit
  // (et le fait que le texte de Miro n'est jamais repris) ; `it.fails` garde l'écart : quand le
  // socle lira `code`, il passera « à l'envers » et signalera qu'il faut retirer `.fails` et les
  // tests « actuel ».
  describe.each([
    { cas: 'code invalide', message: `Invalid authorization code: ${REFRESH}` },
    { cas: 'adresse de retour différente', message: 'Redirect URI mismatch.' },
  ])('refus documenté par Miro ($cas)', ({ message }) => {
    const refusal = { status: 401, code: 'oauthError', message, type: 'error' };

    const exchange = () =>
      exchangeCode(
        miroOAuth,
        CLIENT,
        'code-1',
        null,
        tokenHttp(miroOAuth, 'miro', fakeFetch([tokenRoute(refusal, 401)])),
      ).catch((error: unknown) => error);

    it('actuel : « Réponse inattendue », sans reprendre le texte de Miro', async () => {
      const failure = await exchange();

      expect(failure).toMatchObject({ name: 'ConnectorHttpError', message: 'Réponse inattendue' });
      expect((failure as Error).message).not.toContain(message);
    });

    it.fails("à l'échange du code, rend un refus de l'éditeur sans reprendre son texte", async () => {
      const failure = await exchange();

      expect(failure).toBeInstanceOf(OAuthRefusedError);
      expect((failure as Error).message).not.toContain(REFRESH);
    });
  });
});

describe('toConfig', () => {
  // Le client de /retour : aucun hôte permis, car Miro rend l'équipe dans la réponse de jeton.
  function setupClient() {
    const fetchImpl = fakeFetch([]);
    const http = createConnectorHttp({ provider: 'miro', hosts: miroOAuth.setupHosts, fetchImpl });
    return { http, calls: fetchImpl.calls };
  }

  it('garde l’équipe choisie à l’installation, sans appeler personne', async () => {
    const { http, calls } = setupClient();

    const config = await miroOAuth.toConfig(tokens(RAW), {}, http);

    expect(config).toEqual({ teamId: tokenFirst.team_id });
    expect(calls).toHaveLength(0);
  });

  it('ne garde ni le compte ni le reste de la réponse, et ignore une équipe du mauvais type', async () => {
    const { http } = setupClient();

    expect(Object.keys(await miroOAuth.toConfig(tokens(RAW), {}, http))).toEqual(['teamId']);
    expect(await miroOAuth.toConfig(tokens({ team_id: { piege: true } }), {}, http)).toEqual({
      teamId: null,
    });
    expect(await miroOAuth.toConfig(tokens({}), {}, http)).toEqual({ teamId: null });
  });

  it('rend une configuration que le schéma accepte', async () => {
    const { http } = setupClient();
    const config = await miroOAuth.toConfig(tokens(RAW), {}, http);

    const parsed = miroConnector.configSchema.safeParse({
      ...OAUTH_CONFIG,
      ...config,
      authMode: 'oauth',
    });

    expect(parsed.success).toBe(true);
  });
});

describe('configSchema', () => {
  const schema = miroConnector.configSchema;

  it('accepte la forme à bouton, avec l’équipe', () => {
    expect(schema.parse(OAUTH_CONFIG)).toEqual(OAUTH_CONFIG);
  });

  it('accepte un jeton de rafraîchissement, une échéance ou une équipe nuls', () => {
    const base = { authMode: 'oauth', accessToken: ACCESS };

    expect(schema.safeParse(base).success).toBe(true);
    expect(
      schema.safeParse({ ...base, refreshToken: null, expiresAt: null, teamId: null }).success,
    ).toBe(true);
  });

  it('refuse toute autre forme : Miro ne se branche pas par une clé collée', () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ authMode: 'oauth' }).success).toBe(false);
    expect(schema.safeParse({ authMode: 'oauth', accessToken: '' }).success).toBe(false);
    expect(schema.safeParse({ accessToken: ACCESS }).success).toBe(false);
    expect(schema.safeParse({ authMode: 'key', accessToken: ACCESS }).success).toBe(false);
    expect(schema.safeParse({ token: ACCESS }).success).toBe(false);
    expect(schema.safeParse({ authMode: 'key', token: ACCESS }).success).toBe(false);
  });

  it('nomme le champ manquant dans l’erreur', () => {
    const result = schema.safeParse({ authMode: 'oauth' });

    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['accessToken']]);
  });

  it('reste un objet à champs lisibles, sans aucun champ de clé à chiffrer à part', () => {
    const shape = (schema as unknown as { shape: Record<string, unknown> }).shape;

    expect(Object.keys(shape).sort()).toEqual(
      ['accessToken', 'authMode', 'expiresAt', 'refreshToken', 'teamId'].sort(),
    );
    expect(miroConnector.secretFields).toEqual([]);
  });
});
