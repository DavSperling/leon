import { createHash } from 'node:crypto';
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
import { githubConnector } from './connector';
import { githubOAuth } from './oauth';

vi.mock('../connections', () => ({ saveOAuthTokens: vi.fn() }));

const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const CLIENT = { id: 'Iv1.identifiant-de-test', secret: 'secret-appli-xyz' };
const NOW = Date.UTC(2026, 9, 15, 10, 0, 0);

// La réponse d'un échange de code ou d'un renouvellement, avec les champs que décrit la doc de
// GitHub (jeton d'accès de 8 h, jeton de rafraîchissement de 6 mois, scope toujours vide) et des
// valeurs inventées.
const answer = {
  access_token: 'ghu_exemple-acces-1',
  expires_in: 28800,
  refresh_token: 'ghr_exemple-rafraichir-1',
  refresh_token_expires_in: 15897600,
  scope: '',
  token_type: 'bearer',
};

const pending: OAuthPending = {
  provider: 'github',
  userId: 'u',
  tenantId: 't',
  state: 'etat-1',
  verifier: 'verificateur-0123456789-0123456789-0123456789',
  since: '30',
  preFields: {},
  reconnectId: null,
  createdAt: NOW,
};

const tokenRoute = (json: unknown, status = 200) => ({
  method: 'POST' as const,
  url: TOKEN_URL,
  status,
  json,
});

function httpWith(routes: Parameters<typeof fakeFetch>[0], hosts = ['github.com']) {
  const fetchImpl = fakeFetch(routes);
  const http = createConnectorHttp({
    provider: 'github',
    hosts,
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

describe('github : description du bouton (GitHub App)', () => {
  it('suit la doc de GitHub : adresses, aucun droit, PKCE, secret avec les paramètres', () => {
    expect(githubOAuth).toMatchObject({
      appKey: 'GITHUB',
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: TOKEN_URL,
      scopes: [],
      pkce: true,
      clientAuth: 'body',
      preFields: [],
      setupHosts: [],
    });
    expect(githubOAuth.tokenBody ?? 'form').toBe('form');
    expect(githubOAuth.extraAuthorizeParams).toEqual({ prompt: 'select_account' });
    expect(githubOAuth.extraTokenParams).toBeUndefined();
    expect(githubOAuth.adminConsent).toBeUndefined();
  });

  it('est celle du connecteur', () => {
    expect(githubConnector.oauth).toBe(githubOAuth);
  });

  it('demande le code à GitHub sans paramètre scope, avec le défi PKCE et le choix du compte', () => {
    const url = new URL(authorizeUrl(githubOAuth, CLIENT, pending));

    expect(`${url.origin}${url.pathname}`).toBe('https://github.com/login/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT.id,
      redirect_uri: redirectUri(githubOAuth),
      response_type: 'code',
      state: 'etat-1',
      code_challenge: createHash('sha256')
        .update(pending.verifier ?? '')
        .digest('base64url'),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    expect(redirectUri(githubOAuth)).toMatch(/\/api\/v1\/connexions\/oauth\/github\/retour$/);
  });
});

describe('github : jetons', () => {
  it('échange le code contre les jetons, secret et vérificateur avec les paramètres', async () => {
    const { http, calls } = httpWith([tokenRoute(answer)]);

    const tokens = await exchangeCode(githubOAuth, CLIENT, 'code-1', pending.verifier, http);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(calls[0]?.headers.accept).toBe('application/json');
    expect(calls[0]?.body).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: redirectUri(githubOAuth),
      code_verifier: pending.verifier,
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(tokens).toEqual({
      accessToken: 'ghu_exemple-acces-1',
      refreshToken: 'ghr_exemple-rafraichir-1',
      expiresAt: new Date(NOW + 28_800_000).toISOString(),
      scope: '',
      raw: {
        expires_in: 28800,
        refresh_token_expires_in: 15897600,
        scope: '',
        token_type: 'bearer',
      },
    });
  });

  it('renouvelle avec le jeton de rafraîchissement et garde le nouveau, qui tourne', async () => {
    const renewed = { ...answer, access_token: 'ghu_exemple-acces-2', refresh_token: 'ghr_2' };
    const { http, calls } = httpWith([tokenRoute(renewed)]);

    const tokens = await refreshTokens(githubOAuth, CLIENT, 'ghr_exemple-rafraichir-1', http);

    expect(calls[0]?.body).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'ghr_exemple-rafraichir-1',
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(tokens.accessToken).toBe('ghu_exemple-acces-2');
    expect(tokens.refreshToken).toBe('ghr_2');
    expect(tokens.expiresAt).toBe(new Date(NOW + 28_800_000).toISOString());
  });

  it('lit un jeton qui n’expire pas (option « Expire user authorization tokens » décochée)', async () => {
    const { http } = httpWith([tokenRoute({ access_token: 'ghu_exemple-acces-3', scope: '' })]);

    const tokens = await exchangeCode(githubOAuth, CLIENT, 'code-1', pending.verifier, http);

    expect(tokens).toMatchObject({ accessToken: 'ghu_exemple-acces-3', refreshToken: null });
    expect(tokens.expiresAt).toBeNull();
  });

  // GitHub répond 200 à un code ou un jeton refusé, avec `error` dans le corps.
  it.each([
    ['bad_verification_code', 'exchange'],
    ['incorrect_client_credentials', 'exchange'],
    ['redirect_uri_mismatch', 'exchange'],
    ['bad_refresh_token', 'refresh'],
  ] as const)('traite « %s » (réponse 200) comme un refus de l’éditeur', async (error, step) => {
    const { http } = httpWith([tokenRoute({ error, error_description: 'texte de GitHub' })]);

    const run =
      step === 'exchange'
        ? exchangeCode(githubOAuth, CLIENT, 'code-1', pending.verifier, http)
        : refreshTokens(githubOAuth, CLIENT, 'ghr_ancien', http);

    const failure = await run.catch((caught: unknown) => caught);
    expect(failure).toBeInstanceOf(OAuthRefusedError);
    expect((failure as Error).message).not.toContain('texte de GitHub');
  });
});

describe('github : toConfig', () => {
  const tokens = {
    accessToken: 'ghu_exemple-acces-1',
    refreshToken: 'ghr_exemple-rafraichir-1',
    expiresAt: '2026-10-15T18:00:00.000Z',
    scope: '',
    raw: { token_type: 'bearer' },
  };

  it('ne demande rien avant le clic et n’appelle personne : les dépôts sont ceux de l’installation', async () => {
    const { http, calls } = httpWith([], githubOAuth.setupHosts);

    const config = await githubOAuth.toConfig(tokens, {}, http);

    expect(config).toEqual({});
    expect(calls).toEqual([]);
  });

  it('ne met aucun jeton dans ce qu’elle rend, et la configuration finale est valide', async () => {
    const { http } = httpWith([], githubOAuth.setupHosts);

    const fromTool = await githubOAuth.toConfig(tokens, {}, http);
    const parsed = githubConnector.configSchema.safeParse({
      ...fromTool,
      authMode: 'oauth',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });

    expect(JSON.stringify(fromTool)).not.toContain('ghu_');
    expect(JSON.stringify(fromTool)).not.toContain('ghr_');
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({
      authMode: 'oauth',
      accessToken: 'ghu_exemple-acces-1',
      refreshToken: 'ghr_exemple-rafraichir-1',
      expiresAt: '2026-10-15T18:00:00.000Z',
      repos: [],
    });
  });
});

describe('github : après le branchement', () => {
  const API = 'https://api.github.com';
  const config = { authMode: 'oauth', accessToken: 'ghu_exemple-acces-1', repos: [] };
  const apiHttp = (routes: Parameters<typeof fakeFetch>[0]) => httpWith(routes, ['api.github.com']);

  afterEach(() => vi.unstubAllEnvs());

  it('sans dépôt ouvert, enchaîne sur l’écran d’installation de l’appli', async () => {
    vi.stubEnv('LEON_OAUTH_GITHUB_APP', 'leon-memory');
    const { http, calls } = apiHttp([
      { url: `${API}/user/installations`, json: { installations: [] } },
    ]);

    const next = await githubOAuth.nextStep?.(config, http);

    expect(next).toBe('https://github.com/apps/leon-memory/installations/new');
    expect(calls[0]?.headers.authorization).toBe('Bearer ghu_exemple-acces-1');
  });

  it('revient à Leon quand l’appli ouvre déjà un dépôt', async () => {
    vi.stubEnv('LEON_OAUTH_GITHUB_APP', 'leon-memory');
    const { http } = apiHttp([
      { url: `${API}/user/installations`, json: { installations: [{ id: 7 }] } },
      {
        url: `${API}/user/installations/7/repositories`,
        json: { repositories: [{ full_name: 'acme/leon' }] },
      },
    ]);

    expect(await githubOAuth.nextStep?.(config, http)).toBeNull();
  });

  it('revient à Leon sans rien appeler quand le nom de l’appli n’est pas réglé, ou des dépôts sont choisis', async () => {
    vi.stubEnv('LEON_OAUTH_GITHUB_APP', '');
    const { http, calls } = apiHttp([]);

    expect(await githubOAuth.nextStep?.(config, http)).toBeNull();
    vi.stubEnv('LEON_OAUTH_GITHUB_APP', 'leon-memory');
    expect(await githubOAuth.nextStep?.({ ...config, repos: ['acme/leon'] }, http)).toBeNull();
    expect(calls).toEqual([]);
  });
});
