import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { type FakeRoute, fakeFetch } from '@/test/fake-fetch';
import { gmailConnector } from './gmail/connector';
import { ConnectorHttpError } from './http';
import {
  connectorHttp,
  createConnectLink,
  deleteExternalUser,
  findAccount,
  forgetPipedreamToken,
  listLeonUsers,
  type PipedreamEnv,
  pipedreamEnv,
  proxyFetch,
} from './pipedream';

// Des identifiants générés à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const SECRET = randomBytes(16).toString('hex');
const ENV: PipedreamEnv = {
  projectId: 'proj_essai',
  clientId: 'client-essai',
  clientSecret: SECRET,
  environment: 'development',
};
const CONFIG = {
  authMode: 'pipedream',
  externalUserId: 'leon-u1',
  accountId: 'apn_abc123',
} as const;
const API = 'https://api.pipedream.com';
const TOKEN_URL = `${API}/v1/oauth/token`;
const CONNECT = `${API}/v1/connect/proj_essai`;

const token = (value: string, expiresIn = 3600): FakeRoute => ({
  method: 'POST',
  url: TOKEN_URL,
  json: { access_token: value, token_type: 'Bearer', expires_in: expiresIn },
});

beforeEach(() => forgetPipedreamToken());
afterEach(() => vi.unstubAllEnvs());

describe('pipedreamEnv', () => {
  it('rend null tant qu’il manque un des trois identifiants', () => {
    vi.stubEnv('PIPEDREAM_PROJECT_ID', 'proj_essai');
    vi.stubEnv('PIPEDREAM_CLIENT_ID', 'client-essai');
    vi.stubEnv('PIPEDREAM_CLIENT_SECRET', '');
    expect(pipedreamEnv()).toBeNull();
  });

  it('reste en développement sauf demande explicite de la production', () => {
    vi.stubEnv('PIPEDREAM_PROJECT_ID', 'proj_essai');
    vi.stubEnv('PIPEDREAM_CLIENT_ID', 'client-essai');
    vi.stubEnv('PIPEDREAM_CLIENT_SECRET', SECRET);
    vi.stubEnv('PIPEDREAM_ENVIRONMENT', 'prod');
    expect(pipedreamEnv()?.environment).toBe('development');
    vi.stubEnv('PIPEDREAM_ENVIRONMENT', 'production');
    expect(pipedreamEnv()?.environment).toBe('production');
  });
});

describe('createConnectLink', () => {
  it('demande un jeton Connect pour l’utilisateur et l’appli, avec les adresses de retour', async () => {
    const fetchImpl = fakeFetch([
      token('pd-1'),
      {
        method: 'POST',
        url: `${CONNECT}/tokens`,
        json: {
          token: 'ctok',
          connect_link_url: 'https://pipedream.com/_static/connect.html?token=ctok',
        },
      },
    ]);

    const link = await createConnectLink(
      ENV,
      {
        externalUserId: 'leon-u1',
        app: 'gmail',
        successUri: 'https://leon.test/ok',
        errorUri: 'https://leon.test/ko',
      },
      fetchImpl,
    );

    expect(new URL(link).searchParams.get('app')).toBe('gmail');
    expect(new URL(link).searchParams.get('token')).toBe('ctok');
    const [auth, create] = fetchImpl.calls;
    expect(auth?.body).toEqual({
      grant_type: 'client_credentials',
      client_id: 'client-essai',
      client_secret: SECRET,
    });
    expect(create?.headers.authorization).toBe('Bearer pd-1');
    expect(create?.headers['x-pd-environment']).toBe('development');
    expect(create?.body).toEqual({
      external_user_id: 'leon-u1',
      app_id: 'gmail',
      expires_in: 600,
      success_redirect_uri: 'https://leon.test/ok',
      error_redirect_uri: 'https://leon.test/ko',
    });
  });

  it('garde le jeton serveur d’un appel à l’autre', async () => {
    const created = {
      method: 'POST' as const,
      url: `${CONNECT}/tokens`,
      json: { connect_link_url: 'https://pipedream.com/c?token=t' },
    };
    const fetchImpl = fakeFetch([token('pd-1'), created, created]);
    const input = {
      externalUserId: 'u',
      app: 'gmail',
      successUri: 'https://a.test',
      errorUri: 'https://b.test',
    };

    await createConnectLink(ENV, input, fetchImpl);
    await createConnectLink(ENV, input, fetchImpl);

    expect(fetchImpl.calls.filter((call) => call.url === TOKEN_URL)).toHaveLength(1);
  });

  it('échoue sans rien reprendre de Pipedream quand le jeton est refusé', async () => {
    const fetchImpl = fakeFetch([
      { method: 'POST', url: TOKEN_URL, status: 401, json: { error: `mauvais ${SECRET}` } },
    ]);
    const input = {
      externalUserId: 'u',
      app: 'gmail',
      successUri: 'https://a.test',
      errorUri: 'https://b.test',
    };

    const error = await createConnectLink(ENV, input, fetchImpl).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConnectorHttpError);
    expect(String((error as Error).message)).toBe('Pipedream is unreachable');
    expect(JSON.stringify(error)).not.toContain(SECRET);
  });
});

describe('findAccount', () => {
  const accounts = (data: unknown[]): FakeRoute => ({
    url: `${CONNECT}/accounts`,
    json: { data },
  });

  it('rend le compte sain le plus récent de l’appli', async () => {
    const fetchImpl = fakeFetch([
      token('pd-1'),
      accounts([
        {
          id: 'apn_old',
          healthy: true,
          dead: false,
          created_at: '2026-10-20T10:00:00Z',
          app: { name_slug: 'gmail' },
        },
        {
          id: 'apn_dead',
          healthy: false,
          dead: true,
          created_at: '2026-10-25T10:00:00Z',
          app: { name_slug: 'gmail' },
        },
        {
          id: 'apn_new',
          healthy: true,
          dead: false,
          created_at: '2026-10-24T10:00:00Z',
          app: { name_slug: 'gmail' },
          authorized_scopes: ['s'],
        },
        {
          id: 'apn_slack',
          healthy: true,
          created_at: '2026-10-25T11:00:00Z',
          app: { name_slug: 'slack_v2' },
        },
      ]),
    ]);

    expect(await findAccount(ENV, 'leon-u1', 'gmail', fetchImpl)).toEqual({
      id: 'apn_new',
      scopes: ['s'],
    });
    const query = new URL(fetchImpl.calls[1]?.url ?? '').searchParams;
    expect(query.get('external_user_id')).toBe('leon-u1');
    expect(query.get('app')).toBe('gmail');
  });

  it('rend null sans compte', async () => {
    const empty = fakeFetch([token('pd-1'), accounts([])]);
    expect(await findAccount(ENV, 'leon-u1', 'gmail', empty)).toBeNull();
  });
});

describe('listLeonUsers', () => {
  // Comme en vrai (essai du 25/10) : la dernière page n'a pas d'`end_cursor`.
  const users = (data: unknown[], endCursor: string | null): FakeRoute => ({
    url: `${CONNECT}/users`,
    json: {
      data,
      page_info: {
        count: data.length,
        start_cursor: 'c0',
        ...(endCursor && { end_cursor: endCursor }),
      },
    },
  });
  const user = (externalId: string, createdAt = '2026-10-20T10:00:00Z') => ({
    id: `exu_${externalId}`,
    external_id: externalId,
    created_at: createdAt,
  });

  it('lit toutes les pages et ne rend que les utilisateurs `leon-`', async () => {
    const fetchImpl = fakeFetch([
      token('pd-1'),
      users([user('leon-a'), user('david-essai'), user('ex-leon-b')], 'c1'),
      users([{ id: 'exu_c', external_id: 'leon-c' }], 'c2'),
      users([], 'c2'),
    ]);

    expect(await listLeonUsers(ENV, fetchImpl)).toEqual([
      { externalId: 'leon-a', createdAt: Date.parse('2026-10-20T10:00:00Z') },
      { externalId: 'leon-c', createdAt: Number.NaN },
    ]);
    const queries = fetchImpl.calls.slice(1).map((call) => new URL(call.url).searchParams);
    expect(queries.map((query) => query.get('limit'))).toEqual(['100', '100', '100']);
    expect(queries.map((query) => query.get('after'))).toEqual([null, 'c1', 'c2']);
  });

  it('s’arrête sur une page sans suite, ou qui rend le même curseur', async () => {
    const last = fakeFetch([token('pd-1'), users([user('leon-a')], null)]);
    expect(await listLeonUsers(ENV, last)).toHaveLength(1);

    forgetPipedreamToken();
    const stuck = fakeFetch([
      token('pd-1'),
      users([user('leon-a')], 'c1'),
      users([user('leon-a')], 'c1'),
    ]);
    expect(await listLeonUsers(ENV, stuck)).toHaveLength(2);
    expect(stuck.calls).toHaveLength(3);
  });

  it('remonte « Pipedream injoignable » sur une erreur ou une réponse illisible', async () => {
    const down = fakeFetch([token('pd-1'), { url: `${CONNECT}/users`, status: 500 }]);
    await expect(listLeonUsers(ENV, down)).rejects.toThrow('Pipedream injoignable');

    const odd = fakeFetch([{ url: `${CONNECT}/users`, json: { users: [] } }]);
    await expect(listLeonUsers(ENV, odd)).rejects.toThrow('Pipedream injoignable');
  });
});

describe('deleteExternalUser', () => {
  it('supprime l’utilisateur, et accepte qu’il soit déjà absent', async () => {
    const fetchImpl = fakeFetch([
      token('pd-1'),
      { method: 'DELETE', url: `${CONNECT}/users/leon-u1`, status: 204 },
      { method: 'DELETE', url: `${CONNECT}/users/leon-u1`, status: 404 },
    ]);

    await deleteExternalUser(ENV, 'leon-u1', fetchImpl);
    await deleteExternalUser(ENV, 'leon-u1', fetchImpl);

    expect(fetchImpl.calls.map((call) => call.method)).toEqual(['POST', 'DELETE', 'DELETE']);
  });

  it('remonte une autre erreur', async () => {
    const fetchImpl = fakeFetch([
      token('pd-1'),
      { method: 'DELETE', url: `${CONNECT}/users/leon-u1`, status: 500 },
    ]);
    await expect(deleteExternalUser(ENV, 'leon-u1', fetchImpl)).rejects.toThrow(
      'Pipedream is unreachable',
    );
  });
});

describe('proxyFetch', () => {
  const TARGET = 'https://gmail.googleapis.com/gmail/v1/users/me/profile?x=1';
  const PROXIED = `${CONNECT}/proxy/${Buffer.from(TARGET).toString('base64url')}`;

  it('envoie la requête de l’outil au proxy, avec le jeton de Pipedream à la place du sien', async () => {
    const base = fakeFetch([token('pd-1'), { url: PROXIED, json: { ok: true } }]);
    const proxied = proxyFetch(ENV, CONFIG, base);

    const response = await proxied(TARGET, {
      headers: { authorization: 'Bearer de-l-outil', accept: 'application/json' },
    });

    expect(response.status).toBe(200);
    const call = base.calls[1];
    expect(new URL(call?.url ?? '').searchParams.get('external_user_id')).toBe('leon-u1');
    expect(new URL(call?.url ?? '').searchParams.get('account_id')).toBe('apn_abc123');
    expect(call?.headers.authorization).toBe('Bearer pd-1');
    expect(call?.headers['x-pd-environment']).toBe('development');
    expect(call?.headers.accept).toBe('application/json');
  });

  it('redemande un jeton une seule fois après un 401', async () => {
    const base = fakeFetch([
      token('pd-1'),
      { url: PROXIED, status: 401 },
      token('pd-2'),
      { url: PROXIED, status: 401 },
    ]);

    const response = await proxyFetch(ENV, CONFIG, base)(TARGET, {});

    expect(response.status).toBe(401);
    expect(
      base.calls
        .filter((call) => call.url.split('?')[0] === PROXIED)
        .map((c) => c.headers.authorization),
    ).toEqual(['Bearer pd-1', 'Bearer pd-2']);
  });
});

describe('connectorHttp', () => {
  const PROFILE = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';
  const Profile = z.object({ emailAddress: z.string() });

  it('passe par le proxy pour une connexion Pipedream, avec les hôtes du connecteur', async () => {
    vi.stubEnv('PIPEDREAM_PROJECT_ID', ENV.projectId);
    vi.stubEnv('PIPEDREAM_CLIENT_ID', ENV.clientId);
    vi.stubEnv('PIPEDREAM_CLIENT_SECRET', SECRET);
    const proxied = `${CONNECT}/proxy/${Buffer.from(PROFILE).toString('base64url')}`;
    const fetchImpl = fakeFetch([
      token('pd-1'),
      { url: proxied, json: { emailAddress: 'a@b.test' } },
    ]);
    const http = connectorHttp('gmail', gmailConnector, CONFIG, {
      fetchImpl,
      sleep: async () => {},
    });

    expect(await http.json({ url: PROFILE }, Profile)).toEqual({ emailAddress: 'a@b.test' });
    await expect(http.json({ url: 'https://evil.test/x' }, Profile)).rejects.toThrow(
      'Address not allowed',
    );
  });

  it('refuse chaque requête quand Pipedream n’est pas configuré sur le serveur', async () => {
    vi.stubEnv('PIPEDREAM_PROJECT_ID', '');
    const fetchImpl = fakeFetch([]);
    const http = connectorHttp('gmail', gmailConnector, CONFIG, {
      fetchImpl,
      sleep: async () => {},
    });

    await expect(http.json({ url: PROFILE }, Profile)).rejects.toThrow(
      'Pipedream isn’t configured on this server',
    );
    expect(fetchImpl.calls).toHaveLength(0);
  });
});
