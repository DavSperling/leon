import { describe, expect, it } from 'vitest';
import { fakeFetch } from '@/test/fake-fetch';
import { ConnectorAuthError, createConnectorHttp } from '../http';
import { authorizeUrl, exchangeCode, redirectUri, refreshTokens, tokenHttp } from '../oauth';
import type { OAuthPending } from '../oauth-cookie';
import type { OAuthTokens } from '../types';
import resources from './fixtures/accessible-resources.json';
import { atlassianOAuth } from './oauth';

// La description OAuth que Jira et Confluence partagent (une seule appli Atlassian), et la façon dont
// elle choisit le site. Les droits de chaque produit sont dans les tests de son connecteur.

const JIRA_SCOPES = ['read:jira-work', 'read:jira-user', 'offline_access'];
const CONFLUENCE_SCOPES = ['read:page:confluence', 'read:confluence-user', 'offline_access'];
const RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';
const TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const CLIENT = { id: 'id-appli-atlassian', secret: 'secret-appli-xyz' };
const ACME = '1324a887-45db-1bf4-1e99-ef0ff456d421';
const GLOBEX = '9d3c1a52-7b0e-4f6a-8e21-5c4d3b2a1f00';
const INITECH = '5e7f8a90-1b2c-4d3e-9f40-a1b2c3d4e5f6';

const tokens: OAuthTokens = {
  accessToken: 'jeton-acces-0123456789',
  refreshToken: 'renouvellement-0123',
  expiresAt: '2026-10-15T11:00:00.000Z',
  scope: 'read:jira-work read:jira-user offline_access',
  raw: {},
};

const pending: OAuthPending = {
  provider: 'jira',
  userId: 'u',
  tenantId: 't',
  state: 'etat-1',
  verifier: null,
  since: '30',
  preFields: {},
  reconnectId: null,
  createdAt: 0,
};

function setup(scopes: string[], routes: Parameters<typeof fakeFetch>[0]) {
  const spec = atlassianOAuth(scopes);
  const fetchImpl = fakeFetch(routes);
  const http = createConnectorHttp({
    provider: 'jira',
    hosts: spec.setupHosts,
    fetchImpl,
    sleep: async () => {},
  });
  return { spec, http, calls: fetchImpl.calls };
}

const listing = (json: unknown = resources, status = 200) => [{ url: RESOURCES_URL, json, status }];

describe('atlassianOAuth : la description', () => {
  const spec = atlassianOAuth(JIRA_SCOPES);

  it('vise l’appli Atlassian, ses adresses fixes, sans PKCE, avec un corps JSON', () => {
    expect(spec).toMatchObject({
      appKey: 'ATLASSIAN',
      authorizeUrl: 'https://auth.atlassian.com/authorize',
      tokenUrl: 'https://auth.atlassian.com/oauth/token',
      scopes: JIRA_SCOPES,
      pkce: false,
      clientAuth: 'body',
      tokenBody: 'json',
      extraAuthorizeParams: { audience: 'api.atlassian.com', prompt: 'consent' },
      preFields: ['site'],
      setupHosts: ['api.atlassian.com'],
    });
    expect(spec.adminConsent).toBeUndefined();
  });

  it('écrit l’adresse d’autorisation : droits séparés par une espace, audience, consentement', () => {
    const url = new URL(authorizeUrl(spec, CLIENT, pending));

    expect(url.origin + url.pathname).toBe('https://auth.atlassian.com/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      audience: 'api.atlassian.com',
      client_id: CLIENT.id,
      scope: 'read:jira-work read:jira-user offline_access',
      redirect_uri: redirectUri(spec),
      state: 'etat-1',
      response_type: 'code',
      prompt: 'consent',
    });
  });

  it('partage une seule adresse de retour entre Jira et Confluence', () => {
    expect(redirectUri(spec)).toBe(redirectUri(atlassianOAuth(CONFLUENCE_SCOPES)));
    expect(redirectUri(spec)).toMatch(/\/api\/v1\/connexions\/oauth\/atlassian\/retour$/);
  });

  it('échange le code en JSON, secret avec les paramètres, sans vérificateur', async () => {
    const answer = { access_token: 'acces-1', refresh_token: 'renouv-1', expires_in: 3600 };
    const fetchImpl = fakeFetch([{ method: 'POST', url: TOKEN_URL, json: answer }]);

    const result = await exchangeCode(
      spec,
      CLIENT,
      'code-1',
      null,
      tokenHttp(spec, 'jira', fetchImpl),
    );

    expect(fetchImpl.calls).toHaveLength(1);
    expect(fetchImpl.calls[0]?.headers).toMatchObject({ 'content-type': 'application/json' });
    expect(fetchImpl.calls[0]?.headers.authorization).toBeUndefined();
    expect(fetchImpl.calls[0]?.body).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: redirectUri(spec),
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(result).toMatchObject({ accessToken: 'acces-1', refreshToken: 'renouv-1' });
  });

  it('renouvelle en JSON et garde le nouveau jeton de rafraîchissement (tournant)', async () => {
    const answer = { access_token: 'acces-2', refresh_token: 'renouv-2', expires_in: 3600 };
    const fetchImpl = fakeFetch([{ method: 'POST', url: TOKEN_URL, json: answer }]);

    const result = await refreshTokens(
      spec,
      CLIENT,
      'renouv-1',
      tokenHttp(spec, 'jira', fetchImpl),
    );

    expect(fetchImpl.calls[0]?.body).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'renouv-1',
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
    });
    expect(result).toMatchObject({ accessToken: 'acces-2', refreshToken: 'renouv-2' });
  });
});

describe('atlassianOAuth : toConfig, le choix du site', () => {
  it('lit les sites avec le jeton d’accès, sans rien d’autre', async () => {
    const { spec, http, calls } = setup(JIRA_SCOPES, listing());

    await spec.toConfig(tokens, {}, http);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url).toBe(RESOURCES_URL);
    expect(calls[0]?.headers).toMatchObject({ authorization: `Bearer ${tokens.accessToken}` });
  });

  it('prend le premier site de Jira quand aucun n’est saisi, et compte les autres', async () => {
    const { spec, http } = setup(JIRA_SCOPES, listing());

    const config = await spec.toConfig(tokens, {}, http);

    expect(config).toEqual({ cloudId: ACME, site: 'acme', otherSites: 2 });
  });

  it('prend le site saisi avant le clic, quelle que soit sa place', async () => {
    const { spec, http } = setup(JIRA_SCOPES, listing());

    const config = await spec.toConfig(tokens, { site: 'globex' }, http);

    expect(config).toEqual({ cloudId: GLOBEX, site: 'globex', otherSites: 2 });
  });

  it('prend le premier site quand celui qui est saisi n’existe pas', async () => {
    const { spec, http } = setup(JIRA_SCOPES, listing());

    const config = await spec.toConfig(tokens, { site: 'inconnu' }, http);

    expect(config).toMatchObject({ cloudId: ACME, site: 'acme' });
  });

  it('ne garde que les sites dont les droits sont ceux du produit', async () => {
    const jira = setup(JIRA_SCOPES, listing());
    const confluence = setup(CONFLUENCE_SCOPES, listing());

    // Initech n’a que Confluence : Jira ne le propose pas, ni Confluence ceux de Globex et d’Umbrella.
    expect(await jira.spec.toConfig(tokens, { site: 'initech' }, jira.http)).toMatchObject({
      site: 'acme',
    });
    expect(await confluence.spec.toConfig(tokens, { site: 'initech' }, confluence.http)).toEqual({
      cloudId: INITECH,
      site: 'initech',
      otherSites: 1,
    });
  });

  it('ne compte pas deux fois un site qui revient avec le même identifiant', async () => {
    // Globex est dans la liste deux fois (même identifiant) : deux autres sites, pas trois.
    const { spec, http } = setup(JIRA_SCOPES, listing());

    expect(await spec.toConfig(tokens, {}, http)).toMatchObject({ otherSites: 2 });
  });

  it('écarte une ressource dont l’adresse ou l’identifiant sortent du cadre', async () => {
    const odd = [
      { id: ACME, name: 'a', url: 'https://acme.example.com', scopes: ['read:jira-work'] },
      { id: ACME, name: 'a', url: 'http://acme.atlassian.net', scopes: ['read:jira-work'] },
      { id: 'a/../b', name: 'a', url: 'https://acme.atlassian.net', scopes: ['read:jira-work'] },
      { id: GLOBEX, name: 'g', url: 'https://globex.atlassian.net', scopes: ['read:jira-work'] },
    ];
    const { spec, http } = setup(JIRA_SCOPES, listing(odd));

    expect(await spec.toConfig(tokens, {}, http)).toEqual({
      cloudId: GLOBEX,
      site: 'globex',
      otherSites: 0,
    });
  });

  it('refuse l’autorisation quand aucun site n’a le produit', async () => {
    const onlyConfluence = resources.filter((row) =>
      row.scopes.some((s) => s.endsWith(':confluence')),
    );
    const none = setup(JIRA_SCOPES, listing(onlyConfluence));
    const empty = setup(JIRA_SCOPES, listing([]));

    await expect(none.spec.toConfig(tokens, {}, none.http)).rejects.toBeInstanceOf(
      ConnectorAuthError,
    );
    await expect(empty.spec.toConfig(tokens, {}, empty.http)).rejects.toBeInstanceOf(
      ConnectorAuthError,
    );
  });

  it('laisse remonter un jeton refusé par Atlassian', async () => {
    const { spec, http } = setup(JIRA_SCOPES, listing({ code: 401 }, 401));

    await expect(spec.toConfig(tokens, {}, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});
