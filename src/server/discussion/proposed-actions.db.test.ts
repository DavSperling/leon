import { afterAll, describe, expect, it } from 'vitest';
import type { ActionView } from '@/lib/actions';
import type { TenantContext } from '@/server/auth/tenant-context';
import { createConnection } from '@/server/connectors/connections';
import { adminPool } from '@/test/db';
import { type FakeRoute, fakeFetch } from '@/test/fake-fetch';
import { dropTeams, newTeam } from '@/test/seed-indexed';
import { createDiscussion, getDiscussion, saveReply } from './discussions';
import { githubBranchTool } from './github-tool';
import { decideAction, proposeBranch } from './proposed-actions';

// Le socle des écritures confirmées (lot 7 de la spec GitHub) sur de vraies lignes : l'outil propose sans rien
// écrire chez GitHub, seul le clic de l'auteur crée la branche, une fois, avec sa propre connexion ; personne
// d'autre ne voit ni ne confirme son action.

const API = 'https://api.github.com';
const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

const RLS_VIOLATION = { cause: { code: '42501' } };

// Sans échéance : la relève des autres tests (worker.db.test.ts) ne prend pas ces connexions.
async function notDue(id: string) {
  await adminPool.query('update connections set next_sync_at = null where id = $1', [id]);
  return id;
}

async function setup() {
  const { members } = await newTeam(['Alice Martin', 'Bob Durand'], tenantIds);
  const [alice, bob] = members as [TenantContext, TenantContext];
  const connection = (ctx: TenantContext, token: string) =>
    createConnection(ctx, {
      provider: 'github',
      label: 'gh',
      config: { authMode: 'key', token, repos: ['acme/leon'] },
      secretFields: ['token'],
      since: new Date('2026-09-01T00:00:00Z'),
    }).then(notDue);
  const aliceConnection = await connection(alice, 'github_pat_alice');
  const discussionId = await createDiscussion(alice, { question: 'Crée la branche feature/x' });
  return { alice, bob, aliceConnection, discussionId, connection };
}

const NEW_BRANCH = `${API}/repos/acme/leon/git/ref/heads/feature/x`;
const proposeRoutes = (): FakeRoute[] => [
  { url: `${API}/repos/acme/leon`, json: { default_branch: 'main' } },
  { url: `${API}/repos/acme/leon/git/ref/heads/main`, json: { object: { sha: SHA } } },
  { url: NEW_BRANCH, status: 404, json: { message: 'Not Found' } },
];
const createRoute = (extra: Partial<FakeRoute> = {}): FakeRoute => ({
  method: 'POST',
  url: `${API}/repos/acme/leon/git/refs`,
  status: 201,
  json: { ref: 'refs/heads/feature/x' },
  ...extra,
});

async function propose(alice: TenantContext, discussionId: string, routes = proposeRoutes()) {
  const fetchImpl = fakeFetch(routes);
  const proposed: ActionView[] = [];
  const text = await githubBranchTool(alice, {
    budget: { chars: 40_000 },
    discussionId,
    fetchImpl,
    onAction: (action) => proposed.push(action),
  }).run({ depot: 'acme/leon', nom: 'feature/x' });
  return { text, action: proposed[0] as ActionView, fetchImpl };
}

describe('creer_branche_github', () => {
  it('propose la branche depuis la branche par défaut, sans rien écrire chez GitHub', async () => {
    const { alice, discussionId } = await setup();

    const { text, action, fetchImpl } = await propose(alice, discussionId);

    expect(text).toContain('Action proposée, en attente');
    expect(text).toContain('Ne dis pas que la branche existe');
    expect(action).toMatchObject({
      kind: 'github.creer_branche',
      status: 'proposee',
      params: { repo: 'acme/leon', branch: 'feature/x', from: 'main', sha: SHA },
    });
    expect(fetchImpl.calls.map((call) => call.method)).toEqual(['GET', 'GET', 'GET']);
  });

  it('ne propose pas une branche qui existe déjà, ni un commit inattendu', async () => {
    const { alice, discussionId } = await setup();
    const [repo, main] = proposeRoutes();
    const exists = await propose(alice, discussionId, [
      repo as FakeRoute,
      main as FakeRoute,
      { url: NEW_BRANCH, json: { object: { sha: SHA } } },
    ]);
    const odd = await propose(alice, discussionId, [
      repo as FakeRoute,
      { ...(main as FakeRoute), json: { object: { sha: 'pas-un-commit' } } },
    ]);

    expect(exists.text).toContain('existe déjà');
    expect(odd.text).toContain('inattendu');
    expect([exists.action, odd.action]).toEqual([undefined, undefined]);
  });

  it('refuse un dépôt que la connexion n’ouvre pas, et un nom de branche invalide', async () => {
    const { alice, discussionId } = await setup();
    const tool = githubBranchTool(alice, { budget: { chars: 40_000 }, discussionId });

    expect(await tool.run({ depot: 'acme/autre', nom: 'x' })).toContain('n’est pas ouvert');
    expect(await tool.run({ depot: 'acme/leon', nom: '../main' })).toContain('invalide');
  });
});

describe('decideAction', () => {
  it('crée la branche au clic, une seule fois, avec le jeton de l’auteur', async () => {
    const { alice, discussionId } = await setup();
    const { action } = await propose(alice, discussionId);
    const fetchImpl = fakeFetch([createRoute()]);

    const done = await decideAction(alice, action.id, 'confirmer', { fetchImpl });
    const again = await decideAction(alice, action.id, 'confirmer', { fetchImpl });

    expect(done).toMatchObject({
      status: 'faite',
      result: { url: 'https://github.com/acme/leon/tree/feature/x', error: null },
    });
    expect(again?.status).toBe('faite');
    expect(fetchImpl.calls).toHaveLength(1);
    expect(fetchImpl.calls[0]?.headers.authorization).toBe('Bearer github_pat_alice');
    expect(fetchImpl.calls[0]?.body).toEqual({ ref: 'refs/heads/feature/x', sha: SHA });
  });

  it('ne laisse ni voir ni confirmer l’action d’un autre membre', async () => {
    const { alice, bob, discussionId } = await setup();
    const { action } = await propose(alice, discussionId);
    const fetchImpl = fakeFetch([]);

    expect(await decideAction(bob, action.id, 'confirmer', { fetchImpl })).toBeNull();
    expect(await decideAction(bob, action.id, 'annuler')).toBeNull();
    expect(fetchImpl.calls).toEqual([]);
  });

  it('refuse en base une action rattachée à la connexion d’un autre', async () => {
    const { alice, bob, discussionId, connection } = await setup();
    const bobConnection = await connection(bob, 'github_pat_bob');

    await expect(
      proposeBranch(alice, {
        discussionId,
        connectionId: bobConnection,
        params: { repo: 'acme/leon', branch: 'x', from: 'main', sha: SHA },
      }),
    ).rejects.toMatchObject(RLS_VIOLATION);
  });

  it('une action annulée ne se confirme plus', async () => {
    const { alice, discussionId } = await setup();
    const { action } = await propose(alice, discussionId);
    const fetchImpl = fakeFetch([]);

    expect((await decideAction(alice, action.id, 'annuler'))?.status).toBe('annulee');
    expect((await decideAction(alice, action.id, 'confirmer', { fetchImpl }))?.status).toBe(
      'annulee',
    );
    expect(fetchImpl.calls).toEqual([]);
  });

  it('une proposition de plus d’une heure est expirée et ne s’exécute pas', async () => {
    const { alice, discussionId } = await setup();
    const { action } = await propose(alice, discussionId);
    await adminPool.query(
      `update actions set created_at = now() - interval '2 hours' where id = $1`,
      [action.id],
    );
    const fetchImpl = fakeFetch([]);

    expect((await decideAction(alice, action.id, 'confirmer', { fetchImpl }))?.status).toBe(
      'expiree',
    );
    expect(fetchImpl.calls).toEqual([]);
  });

  it('dit pourquoi GitHub refuse, sans garder son texte', async () => {
    const { alice, discussionId } = await setup();
    const denied = (await propose(alice, discussionId)).action;
    const taken = (await propose(alice, discussionId)).action;
    const ours = (await propose(alice, discussionId)).action;
    const branch = { url: `${API}/repos/acme/leon/git/ref/heads/feature/x` };

    const refused = await decideAction(alice, denied.id, 'confirmer', {
      fetchImpl: fakeFetch([
        createRoute({ status: 403, json: { message: 'Resource not accessible' } }),
      ]),
    });
    const exists = await decideAction(alice, taken.id, 'confirmer', {
      fetchImpl: fakeFetch([
        createRoute({ status: 422, json: { message: 'Reference already exists' } }),
        { ...branch, json: { object: { sha: 'f'.repeat(40) } } },
      ]),
    });
    // Le même commit : notre création, reprise après une réponse perdue.
    const retried = await decideAction(alice, ours.id, 'confirmer', {
      fetchImpl: fakeFetch([
        createRoute({ status: 422, json: { message: 'Reference already exists' } }),
        { ...branch, json: { object: { sha: SHA } } },
      ]),
    });

    expect(refused).toMatchObject({ status: 'echouee', result: { error: 'droits' } });
    expect(exists).toMatchObject({ status: 'echouee', result: { error: 'existe' } });
    expect(retried).toMatchObject({ status: 'faite' });
  });
});

describe('getDiscussion', () => {
  it('place l’action sous la réponse pendant laquelle Leon l’a proposée', async () => {
    const { alice, discussionId } = await setup();
    const { action } = await propose(alice, discussionId);
    const questionId = (await getDiscussion(alice, discussionId))?.messages[0]?.id ?? '';
    await saveReply(alice, discussionId, { questionId, content: 'Confirmez.', citations: [] });

    const messages = (await getDiscussion(alice, discussionId))?.messages ?? [];

    expect(messages.map((m) => [m.role, m.actions.map((a) => a.id)])).toEqual([
      ['user', []],
      ['assistant', [action.id]],
    ]);
  });
});
