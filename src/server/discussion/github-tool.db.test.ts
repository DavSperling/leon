import { afterAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { createConnection, setConnectionPaused } from '@/server/connectors/connections';
import { OAUTH_SECRET_FIELDS } from '@/server/connectors/oauth';
import { DATA_GUARD_LINE } from '@/server/llm/prompt-guard';
import { fakeFetch } from '@/test/fake-fetch';
import { dropTeams, newTeam } from '@/test/seed-indexed';
import { githubReposTool } from './github-tool';

// depots_github sur de vraies connexions : la connexion GitHub de qui pose la question, jamais celle d'un autre
// membre de l'équipe ; la liste lue à l'instant sur GitHub, coupée et comptée quand le budget manque.

const API = 'https://api.github.com';
const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

async function team() {
  const { members } = await newTeam(['Alice Martin', 'Bob Durand'], tenantIds);
  return members as [TenantContext, TenantContext];
}

const byKey = (ctx: TenantContext, repos: string[]) =>
  createConnection(ctx, {
    provider: 'github',
    label: 'alice-gh',
    config: { authMode: 'key', token: 'github_pat_test', repos },
    secretFields: ['token'],
    since: new Date('2026-09-01T00:00:00Z'),
  });

const byButton = (ctx: TenantContext) =>
  createConnection(ctx, {
    provider: 'github',
    label: 'alice-gh',
    config: {
      authMode: 'oauth',
      accessToken: 'ghu_test',
      refreshToken: 'ghr_test',
      expiresAt: '2099-01-01T00:00:00.000Z',
      repos: [],
    },
    secretFields: [...OAUTH_SECRET_FIELDS, 'token'],
    since: new Date('2026-09-01T00:00:00Z'),
  });

const run = (ctx: TenantContext, deps: { chars?: number; fetchImpl?: typeof fetch } = {}) =>
  githubReposTool(ctx, {
    budget: { chars: deps.chars ?? 40_000 },
    fetchImpl: deps.fetchImpl,
  }).run({});

describe('depots_github', () => {
  it('liste les dépôts de la connexion de l’utilisateur, derrière la ligne de garde', async () => {
    const [alice] = await team();
    await byKey(alice, ['acme/leon', 'acme/site']);

    const text = await run(alice);

    expect(text.split('\n')[0]).toBe(DATA_GUARD_LINE);
    expect(text).toContain('Compte GitHub « alice-gh » : 2 dépôts');
    expect(text).toContain('\nacme/leon\nacme/site\n');
  });

  it('lit en direct les dépôts où l’appli est installée, avec le jeton du bouton', async () => {
    const [alice] = await team();
    await byButton(alice);
    const fetchImpl = fakeFetch([
      { url: `${API}/user/installations`, json: { installations: [{ id: 7 }] } },
      {
        url: `${API}/user/installations/7/repositories`,
        json: { repositories: [{ full_name: 'acme/leon' }, { full_name: 'acme/api' }] },
      },
    ]);

    const text = await run(alice, { fetchImpl });

    expect(text).toContain('\nacme/leon\nacme/api\n');
    expect(fetchImpl.calls.map((call) => call.headers.authorization)).toEqual([
      'Bearer ghu_test',
      'Bearer ghu_test',
    ]);
  });

  it('ne passe jamais par la connexion d’un autre membre', async () => {
    const [alice, bob] = await team();
    await byButton(alice);
    const fetchImpl = fakeFetch([]);

    const text = await run(bob, { fetchImpl });

    expect(text).toContain('n’a pas branché son propre GitHub');
    expect(fetchImpl.calls).toEqual([]);
  });

  it('écarte une connexion en pause', async () => {
    const [alice] = await team();
    await setConnectionPaused(alice, await byKey(alice, ['acme/leon']), true);

    expect(await run(alice)).toContain('n’a pas branché son propre GitHub');
  });

  it('coupe la liste quand le budget de lecture manque, et dit combien manquent', async () => {
    const [alice] = await team();
    await byKey(alice, ['acme/leon', 'acme/site', 'acme/api']);

    const text = await run(alice, { chars: 12 });

    expect(text).toContain('3 dépôts');
    expect(text).toContain('\nacme/leon\n');
    expect(text).not.toContain('acme/site\n');
    expect(text).toContain('Liste coupée : 2 dépôts non affichés');
  });

  it('dit de reconnecter quand GitHub refuse le jeton', async () => {
    const [alice] = await team();
    await byButton(alice);
    const fetchImpl = fakeFetch([{ url: `${API}/user/installations`, status: 401, json: {} }]);

    const text = await run(alice, { fetchImpl });

    expect(text).toContain('GitHub refuse l’accès de la connexion « alice-gh »');
  });
});
