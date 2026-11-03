import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { adminPool } from '@/test/db';
import { createTestTenant, seedConnection } from '@/test/fixtures';
import { listDepotsEquipe, setDepotEquipe } from './depots-equipe';

// Les réglages des dépôts d'équipe (T10) : Ana administre, Paul est simple membre, Zoé est d'une autre organisation.
// Les curseurs sont écrits comme la relève GitHub les écrit (connector.ts) : une clé par dépôt lu.

const tenantIds: string[] = [];
let ana: TenantContext;
let paul: TenantContext;
let zoe: TenantContext;

const MARK = { at: '2026-11-01T10:00:00Z', seen: [1] };

async function seedGithub(ctx: TenantContext, repos: string[]): Promise<void> {
  const id = await seedConnection(ctx);
  const cursor = JSON.stringify(Object.fromEntries(repos.map((repo) => [repo, MARK])));
  await adminPool.query('update connections set cursor = $1 where id = $2', [cursor, id]);
}

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
});

describe('dépôts d’équipe', () => {
  it("propose les dépôts du curseur des seules connexions GitHub de l'administrateur", async () => {
    expect(await listDepotsEquipe(ana)).toEqual([
      { depot: 'acme/app', coche: false },
      { depot: 'acme/site', coche: false },
    ]);
  });

  it('refuse un membre ordinaire, sans rien écrire', async () => {
    expect(await setDepotEquipe(paul, 'paul/perso', true)).toBe('refuse');

    expect(await projectsOf(paul.tenantId)).toEqual([]);
  });

  it('range `Org/Repo` saisi en github.com/org/repo, coché pour toute l’équipe, puis le retire', async () => {
    expect(await setDepotEquipe(ana, ' Org/Repo ', true)).toBe('ok');
    // Cocher deux fois ne change rien.
    expect(await setDepotEquipe(ana, 'org/repo', true)).toBe('ok');

    expect(await projectsOf(ana.tenantId)).toEqual([
      { project: 'github.com/org/repo', choisi_par: ana.userId },
    ]);
    expect(await listDepotsEquipe(ana)).toContainEqual({ depot: 'org/repo', coche: true });
    // Le membre lit la liste cochée, mais jamais les dépôts de l'administrateur.
    expect(await listDepotsEquipe(paul)).toEqual([
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
});
