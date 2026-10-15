import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { collect, type FakeRoute, fakeFetch, testHttp } from '@/test/fake-fetch';
import { ConnectorAuthError, createConnectorHttp } from '../http';
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
import { notionConnector } from './connector';
import commentsEmpty from './fixtures/comments-empty.json';
import me from './fixtures/me.json';
import tokenFirst from './fixtures/oauth-token.json';
import tokenRefreshed from './fixtures/oauth-token-refresh.json';
import { notionOAuth } from './oauth';

// Le bouton « Se connecter avec Notion » : la description OAuth, la conversion des jetons en
// configuration, et la configuration à clé ou à bouton.

// Le socle importe la base par `connections` : inutile ici.
vi.mock('../connections', () => ({ saveOAuthTokens: vi.fn() }));

// Fabriqués à chaque lancement : aucun secret dans le dépôt.
const CLIENT = {
  id: `client-${randomBytes(4).toString('hex')}`,
  secret: randomBytes(16).toString('hex'),
};
const KEY = `ntn_${randomBytes(16).toString('hex')}`;
const ACCESS = `acces-${randomBytes(12).toString('hex')}`;
const REFRESH = `rafraichir-${randomBytes(12).toString('hex')}`;
const API = 'https://api.notion.com/v1';
const SINCE = new Date('2026-09-15T00:00:00Z');

const OAUTH_CONFIG = {
  authMode: 'oauth',
  accessToken: ACCESS,
  refreshToken: REFRESH,
  expiresAt: null,
  workspaceName: 'Acme',
  botId: 'd4a17c93-6e2b-4085-9f31-0b8e5c2a7d33',
};

const pending: OAuthPending = {
  provider: 'notion',
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
  url: `${API}/oauth/token`,
  status,
  json,
});

// Ce que le socle rend de la réponse de jeton : privée des deux jetons.
const { access_token: _access, refresh_token: _refresh, ...RAW } = tokenFirst;

const tokens = (raw: Record<string, unknown>): OAuthTokens => ({
  accessToken: ACCESS,
  refreshToken: REFRESH,
  expiresAt: null,
  scope: null,
  raw,
});

describe('description OAuth', () => {
  it('suit la doc : intégration publique, secret en Basic, corps JSON, aucun droit ni PKCE', () => {
    expect(notionOAuth).toMatchObject({
      appKey: 'NOTION',
      authorizeUrl: 'https://api.notion.com/v1/oauth/authorize',
      tokenUrl: 'https://api.notion.com/v1/oauth/token',
      scopes: [],
      pkce: false,
      clientAuth: 'basic',
      tokenBody: 'json',
      extraAuthorizeParams: { owner: 'user' },
      preFields: [],
      setupHosts: [],
    });
    expect(notionConnector.oauth).toBe(notionOAuth);
  });

  it("n'a qu'un hôte, celui des jetons, que le connecteur appelle aussi", () => {
    expect(new URL(notionOAuth.tokenUrl).host).toBe('api.notion.com');
    expect(notionConnector.hosts(notionConnector.configSchema.parse(OAUTH_CONFIG))).toEqual([
      'api.notion.com',
    ]);
  });

  it("construit l'adresse d'autorisation avec owner=user, sans droit ni défi PKCE", () => {
    const url = new URL(authorizeUrl(notionOAuth, CLIENT, pending));

    expect(`${url.origin}${url.pathname}`).toBe('https://api.notion.com/v1/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT.id,
      redirect_uri: redirectUri(notionOAuth),
      response_type: 'code',
      state: 'etat-1',
      owner: 'user',
    });
    expect(redirectUri(notionOAuth)).toMatch(/\/api\/v1\/connexions\/oauth\/notion\/retour$/);
  });
});

describe('échange du code et renouvellement', () => {
  it('envoie le code en JSON avec le secret en Basic, et lit les deux jetons sans échéance', async () => {
    const fetchImpl = fakeFetch([tokenRoute(tokenFirst)]);

    const result = await exchangeCode(
      notionOAuth,
      CLIENT,
      'code-1',
      null,
      tokenHttp(notionOAuth, 'notion', fetchImpl),
    );

    const [call] = fetchImpl.calls;
    const basic = Buffer.from(`${CLIENT.id}:${CLIENT.secret}`).toString('base64');
    expect(call?.headers.authorization).toBe(`Basic ${basic}`);
    expect(call?.headers['content-type']).toBe('application/json');
    expect(call?.body).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: redirectUri(notionOAuth),
    });
    expect(result.accessToken).toBe(tokenFirst.access_token);
    expect(result.refreshToken).toBe(tokenFirst.refresh_token);
    expect(result.expiresAt).toBeNull();
    expect(result.raw).toMatchObject({ bot_id: tokenFirst.bot_id, workspace_name: 'Acme' });
    expect(result.raw).not.toHaveProperty('access_token');
    expect(result.raw).not.toHaveProperty('refresh_token');
  });

  it('renouvelle avec le seul jeton de rafraîchissement et garde le nouveau, qui tourne', async () => {
    const fetchImpl = fakeFetch([tokenRoute(tokenRefreshed)]);

    const result = await refreshTokens(
      notionOAuth,
      CLIENT,
      REFRESH,
      tokenHttp(notionOAuth, 'notion', fetchImpl),
    );

    expect(fetchImpl.calls[0]?.body).toEqual({
      grant_type: 'refresh_token',
      refresh_token: REFRESH,
    });
    expect(fetchImpl.calls[0]?.headers.authorization).toMatch(/^Basic /);
    expect(result.accessToken).toBe(tokenRefreshed.access_token);
    expect(result.refreshToken).toBe(tokenRefreshed.refresh_token);
    expect(result.expiresAt).toBeNull();
  });

  // Ce test ne dit rien de ce que Notion envoie : la forme { error, error_description } est celle
  // que le socle sait lire (RFC 6749), pas celle de la doc Notion (voir plus bas).
  it("lit un refus au format RFC 6749 ({ error: 'invalid_grant' }) sans reprendre son texte", async () => {
    const refusal = {
      error: 'invalid_grant',
      error_description: `Le jeton ${REFRESH} est périmé.`,
    };
    const fetchImpl = fakeFetch([tokenRoute(refusal, 400)]);

    const failure = await refreshTokens(
      notionOAuth,
      CLIENT,
      REFRESH,
      tokenHttp(notionOAuth, 'notion', fetchImpl),
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(OAuthRefusedError);
    expect((failure as Error).message).not.toContain(REFRESH);
  });

  // La forme que la doc Notion décrit (reference/create-a-token, refresh-a-token, status-codes) :
  // { object: 'error', status, code, message }, en 400 pour invalid_grant et en 401 pour
  // invalid_client, sans champ `error`. Le socle la compte comme un refus : /retour répond 'refuse' et
  // un renouvellement forcé met la connexion en 'auth_error' (« Reconnectez Notion »).
  describe.each([
    { status: 400, code: 'invalid_grant' },
    { status: 401, code: 'invalid_client' },
  ])('refus documenté par Notion ($status $code)', ({ status, code }) => {
    const refusal = { object: 'error', status, code, message: `Le jeton ${REFRESH} est périmé.` };

    it("au renouvellement, rend un refus de l'éditeur sans reprendre son texte", async () => {
      const fetchImpl = fakeFetch([tokenRoute(refusal, status)]);

      const failure = await refreshTokens(
        notionOAuth,
        CLIENT,
        REFRESH,
        tokenHttp(notionOAuth, 'notion', fetchImpl),
      ).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(OAuthRefusedError);
      expect((failure as Error).message).not.toContain(REFRESH);
    });

    it("à l'échange du code, rend un refus de l'éditeur", async () => {
      const fetchImpl = fakeFetch([tokenRoute(refusal, status)]);

      const failure = await exchangeCode(
        notionOAuth,
        CLIENT,
        'code-1',
        null,
        tokenHttp(notionOAuth, 'notion', fetchImpl),
      ).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(OAuthRefusedError);
    });
  });
});

describe('toConfig', () => {
  // Le client de /retour : aucun hôte permis, car Notion rend tout dans la réponse de jeton.
  function setupClient() {
    const fetchImpl = fakeFetch([]);
    const http = createConnectorHttp({
      provider: 'notion',
      hosts: notionOAuth.setupHosts,
      fetchImpl,
    });
    return { http, calls: fetchImpl.calls };
  }

  it("garde le nom de l'espace et l'identifiant du robot, sans appeler personne", async () => {
    const { http, calls } = setupClient();

    const config = await notionOAuth.toConfig(tokens(RAW), {}, http);

    expect(config).toEqual({ workspaceName: 'Acme', botId: tokenFirst.bot_id });
    expect(calls).toHaveLength(0);
  });

  it("ne garde ni le propriétaire, ni l'icône, ni le reste de la réponse", async () => {
    const { http } = setupClient();

    const config = await notionOAuth.toConfig(tokens(RAW), {}, http);

    expect(Object.keys(config).sort()).toEqual(['botId', 'workspaceName']);
    expect(JSON.stringify(config)).not.toContain('marie@acme.example');
  });

  it('accepte un espace sans nom (workspace_name est facultatif)', async () => {
    const { http } = setupClient();
    const raw = { ...RAW, workspace_name: null };

    const config = await notionOAuth.toConfig(tokens(raw), {}, http);

    expect(config).toEqual({ workspaceName: null, botId: tokenFirst.bot_id });
    expect(notionConnector.configSchema.safeParse({ ...OAUTH_CONFIG, ...config }).success).toBe(
      true,
    );
  });

  it('ignore un champ du mauvais type plutôt que de le recopier', async () => {
    const { http } = setupClient();
    const raw = { workspace_name: { piege: true }, bot_id: 42 };

    const config = await notionOAuth.toConfig(tokens(raw), {}, http);

    expect(config).toEqual({ workspaceName: null, botId: null });
  });
});

describe('configSchema', () => {
  const schema = notionConnector.configSchema;

  it('accepte la forme à bouton, avec les champs de toConfig', () => {
    expect(schema.parse(OAUTH_CONFIG)).toEqual(OAUTH_CONFIG);
  });

  it("accepte un jeton de rafraîchissement ou une échéance nuls, et l'échéance en ISO", () => {
    const base = { authMode: 'oauth', accessToken: ACCESS };

    expect(schema.safeParse({ ...base, refreshToken: null, expiresAt: null }).success).toBe(true);
    expect(schema.safeParse({ ...base, expiresAt: '2026-10-16T10:00:00.000Z' }).success).toBe(true);
  });

  it("accepte l'ancienne forme à clé, sans authMode : c'est une clé", () => {
    expect(schema.parse({ token: `  ${KEY} ` })).toEqual({ authMode: 'key', token: KEY });
    expect(schema.parse({ authMode: 'key', token: KEY })).toEqual({ authMode: 'key', token: KEY });
  });

  it('refuse une forme incomplète', () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ authMode: 'key' }).success).toBe(false);
    expect(schema.safeParse({ authMode: 'oauth' }).success).toBe(false);
    expect(schema.safeParse({ authMode: 'oauth', token: KEY }).success).toBe(false);
    expect(schema.safeParse({ authMode: 'oauth', accessToken: '' }).success).toBe(false);
    expect(schema.safeParse({ authMode: 'inconnu', accessToken: ACCESS }).success).toBe(false);
    expect(schema.safeParse({ accessToken: ACCESS }).success).toBe(false);
  });

  it("nomme le champ manquant dans l'erreur", () => {
    const oauth = schema.safeParse({ authMode: 'oauth' });
    const key = schema.safeParse({ authMode: 'key' });

    expect(oauth.error?.issues.map((issue) => issue.path)).toEqual([['accessToken']]);
    expect(key.error?.issues.map((issue) => issue.path)).toEqual([['token']]);
  });

  it('reste un objet à champs lisibles, et ne chiffre dans secretFields que la clé', () => {
    const shape = (schema as unknown as { shape: Record<string, unknown> }).shape;

    expect(Object.keys(shape)).toEqual(
      expect.arrayContaining(['token', 'accessToken', 'refreshToken', 'expiresAt', 'authMode']),
    );
    expect(notionConnector.secretFields).toEqual(['token']);
  });
});

describe('avec le jeton du bouton', () => {
  it("verify l'envoie en Bearer, avec la version de l'API", async () => {
    const { http, calls } = testHttp(notionConnector, OAUTH_CONFIG, [
      { url: `${API}/users/me`, json: me },
    ]);
    const config = notionConnector.configSchema.parse(OAUTH_CONFIG);

    await expect(notionConnector.verify(config, http)).resolves.toEqual({ account: 'Leon (Acme)' });

    expect(calls[0]?.headers.authorization).toBe(`Bearer ${ACCESS}`);
    expect(calls[0]?.headers['notion-version']).toBe('2026-03-11');
  });

  it("sync l'envoie en Bearer sur la recherche, les blocs et les commentaires, jamais la clé", async () => {
    const page = {
      object: 'page',
      id: '00000000-0000-4000-8000-000000000001',
      last_edited_time: '2026-10-01T09:00:00.000Z',
      url: 'https://www.notion.so/page-1',
      parent: { type: 'workspace', workspace: true },
      properties: { title: { id: 'title', type: 'title', title: [{ plain_text: 'Page 1' }] } },
    };
    const routes: FakeRoute[] = [
      {
        method: 'POST',
        url: `${API}/search`,
        json: { results: [page], next_cursor: null, has_more: false },
      },
      {
        url: `${API}/blocks/${page.id}/children`,
        json: {
          results: [
            {
              id: 'b1',
              type: 'paragraph',
              has_children: false,
              paragraph: { rich_text: [{ plain_text: 'Texte' }] },
            },
          ],
          next_cursor: null,
          has_more: false,
        },
      },
      { url: new RegExp(`/v1/comments\\?block_id=${page.id}(&|$)`), json: commentsEmpty },
    ];
    const { http, calls } = testHttp(notionConnector, OAUTH_CONFIG, routes);
    const config = notionConnector.configSchema.parse(OAUTH_CONFIG);

    const pages = await collect(notionConnector.sync(config, { cursor: null, since: SINCE }, http));

    expect(pages.flatMap((p) => p.items)).toHaveLength(1);
    expect(calls).toHaveLength(3);
    for (const call of calls) expect(call.headers.authorization).toBe(`Bearer ${ACCESS}`);
  });

  it('remonte un jeton refusé (401) pour que le socle le renouvelle', async () => {
    const { http } = testHttp(notionConnector, OAUTH_CONFIG, [
      {
        url: `${API}/users/me`,
        status: 401,
        json: { object: 'error', status: 401, code: 'unauthorized', message: 'Jeton invalide.' },
      },
    ]);
    const config = notionConnector.configSchema.parse(OAUTH_CONFIG);

    await expect(notionConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('la clé collée marche toujours, avec son en-tête', async () => {
    const { http, calls } = testHttp(notionConnector, { token: KEY }, [
      { url: `${API}/users/me`, json: me },
    ]);
    const config = notionConnector.configSchema.parse({ token: KEY });

    await notionConnector.verify(config, http);

    expect(calls[0]?.headers.authorization).toBe(`Bearer ${KEY}`);
  });
});
