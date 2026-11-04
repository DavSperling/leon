import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { adminPool } from '@/test/db';
import { fakeFetch } from '@/test/fake-fetch';
import { createTestTenant, seedConnection } from '@/test/fixtures';
import { seedRun } from '@/test/seed-search';
import { listDepotsEquipe, setDepotEquipe } from './depots-equipe';

// Les réglages des dépôts d'équipe (T10) : Ana administre, Paul est simple membre, Zoé est d'une autre organisation.
// Les curseurs sont écrits comme la relève GitHub les écrit (connector.ts) : une clé par dépôt lu. Chaque connexion
// est à clé, sur ses propres dépôts.

const tenantIds: string[] = [];
let ana: TenantContext;
let paul: TenantContext;
let zoe: TenantContext;

const MARK = { at: '2026-11-01T10:00:00Z', seen: [1] };

async function seedGithub(ctx: TenantContext, repos: string[]): Promise<void> {
  const id = await seedConnection(ctx);
  const cursor = JSON.stringify(Object.fromEntries(repos.map((repo) => [repo, MARK])));
  await adminPool.query('update connections set cursor = $1, config = $2 where id = $3', [
    cursor,
    { repos },
    id,
  ]);
}

// GitHub tel que le voit la connexion d'Ana : la permission sur chaque dépôt demandé (C03).
const githubOfAna = (permissions: Record<string, boolean | 404>) => ({
  fetchImpl: fakeFetch(
    Object.entries(permissions).map(([repo, pull]) => ({
      url: `https://api.github.com/repos/${repo}`,
      ...(pull === 404 ? { status: 404 } : { json: { permissions: { pull } } }),
    })),
  ),
});

const projectsOf = async (tenantId: string) =>
  (
    await adminPool.query<{ project: string; choisi_par: string }>(
      'select project, choisi_par from depots_equipe where tenant_id = $1 order by project',
      [tenantId],
    )
  ).rows;

beforeAll(async () => {
  const team = await createTestTenant(['Ana', 'Paul']);
  const other = await createTestTenant(['Zoé']);
  [ana, paul] = team.members as [TenantContext, TenantContext];
  [zoe] = other.members as [TenantContext];
  tenantIds.push(team.tenantId, other.tenantId);
  await adminPool.query(
    `update member set role = 'admin' where "userId" = $1 and "organizationId" = $2`,
    [ana.userId, ana.tenantId],
  );
  await seedGithub(ana, ['Acme/App', 'acme/site']);
  await seedGithub(paul, ['paul/perso', 'acme/app']);
  await seedGithub(zoe, ['zoe/ailleurs']);
});

afterAll(async () => {
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
});

describe('dépôts d’équipe', () => {
  it("propose les dépôts du curseur des seules connexions GitHub de l'administrateur", async () => {
    expect(await listDepotsEquipe(ana)).toEqual({
      depots: [
        { depot: 'acme/app', coche: false },
        { depot: 'acme/site', coche: false },
      ],
      githubBranche: true,
    });
  });

  // C17 : le bandeau « Aucun dépôt d'équipe » ne parle qu'à une équipe où quelqu'un a branché GitHub.
  it("dit si un membre de l'équipe a branché GitHub, sans proposer ses dépôts", async () => {
    const solo = await createTestTenant(['Léa', 'Marc']);
    tenantIds.push(solo.tenantId);
    const [lea, marc] = solo.members as [TenantContext, TenantContext];

    expect(await listDepotsEquipe(lea)).toEqual({ depots: [], githubBranche: false });

    await seedGithub(marc, ['marc/perso']);
    expect(await listDepotsEquipe(lea)).toEqual({ depots: [], githubBranche: true });
  });

  it('refuse un membre ordinaire, sans rien écrire', async () => {
    expect(await setDepotEquipe(paul, 'paul/perso', true)).toBe('refuse');

    expect(await projectsOf(paul.tenantId)).toEqual([]);
  });

  it('range `Org/Repo` saisi en github.com/org/repo, coché pour toute l’équipe, puis le retire', async () => {
    const github = githubOfAna({ 'Org/Repo': true, 'org/repo': true });
    expect(await setDepotEquipe(ana, ' Org/Repo ', true, github)).toBe('ok');
    // Cocher deux fois ne change rien.
    expect(await setDepotEquipe(ana, 'org/repo', true, github)).toBe('ok');

    expect(await projectsOf(ana.tenantId)).toEqual([
      { project: 'github.com/org/repo', choisi_par: ana.userId },
    ]);
    expect((await listDepotsEquipe(ana)).depots).toContainEqual({ depot: 'org/repo', coche: true });
    // Le membre lit la liste cochée, mais jamais les dépôts de l'administrateur.
    expect((await listDepotsEquipe(paul)).depots).toEqual([
      { depot: 'acme/app', coche: false },
      { depot: 'org/repo', coche: true },
      { depot: 'paul/perso', coche: false },
    ]);

    expect(await setDepotEquipe(ana, 'Org/Repo', false)).toBe('ok');
    expect(await projectsOf(ana.tenantId)).toEqual([]);
  });

  it.each(['acme', 'acme/app/x', '../app', 'acme/..', 'github.com/acme/app'])(
    'refuse la saisie %s',
    async (depot) => {
      expect(await setDepotEquipe(ana, depot, true)).toBe('invalide');
    },
  );

  // T12 : la liste change, les sources GitHub déjà relevées suivent, dans la même transaction (0048).
  it('décocher un dépôt rend ses PR déjà relevées privées à qui les a relevées', async () => {
    const { sourceId } = await seedRun(paul, {
      kind: 'github',
      acl: [paul.tenantId],
      metadata: { origin: { repo: 'Acme/Outil' } },
    });
    const aclOf = async () =>
      (
        await adminPool.query<{ acl: string[] }>(
          'select acl::text[] as acl from sources where id = $1',
          [sourceId],
        )
      ).rows[0]?.acl;

    expect(await setDepotEquipe(ana, 'acme/outil', true, githubOfAna({ 'acme/outil': true }))).toBe(
      'ok',
    );
    expect(await aclOf()).toEqual([paul.tenantId]);

    expect(await setDepotEquipe(ana, 'Acme/Outil', false)).toBe('ok');
    expect(await aclOf()).toEqual([paul.userId]);
  });

  // C03 : cocher partage avec l'équipe ce qui est déjà relevé du dépôt, puis ce que la relève de chacun en lit. Le
  // nom d'un dépôt perso ne suffit pas : l'administrateur doit le lire lui-même sur GitHub.
  it('Ana coche paul/perso sans y avoir accès : refusé, la PR de Paul reste privée', async () => {
    const { sourceId } = await seedRun(paul, {
      kind: 'github',
      acl: [paul.userId],
      metadata: { origin: { repo: 'paul/perso' } },
    });
    const github = githubOfAna({ 'paul/perso': 404, 'Paul/Perso': false });

    expect(await setDepotEquipe(ana, 'paul/perso', true, github)).toBe('illisible');
    expect(await setDepotEquipe(ana, 'Paul/Perso', true, github)).toBe('illisible');

    expect(github.fetchImpl.calls).toHaveLength(2);
    expect(await projectsOf(ana.tenantId)).toEqual([]);
    const { rows } = await adminPool.query<{ acl: string[] }>(
      'select acl::text[] as acl from sources where id = $1',
      [sourceId],
    );
    expect(rows[0]?.acl).toEqual([paul.userId]);
  });

  it('décoche sans rien demander à GitHub', async () => {
    const github = githubOfAna({});

    expect(await setDepotEquipe(ana, 'paul/perso', false, github)).toBe('ok');

    expect(github.fetchImpl.calls).toEqual([]);
  });
});
