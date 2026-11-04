import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';
import { adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';

// Migration 0047 : les dépôts d'équipe (décision D). Toute l'équipe lit la liste ; seuls ses propriétaires et ses
// administrateurs l'écrivent, contrôle fait en base. Fixtures par le propriétaire (hors RLS), le reste sous withTenant.

let ana: TenantContext; // propriétaire
let bob: TenantContext; // administrateur, rangé avec un autre rôle
let paul: TenantContext; // membre ici, administrateur ailleurs
let zoe: TenantContext; // l'autre organisation

const RLS_ERROR = {
  cause: { code: '42501', message: expect.stringMatching(/row-level security/) },
};

beforeAll(async () => {
  const team = await createTestTenant(['Ana', 'Bob', 'Paul']);
  const other = await createTestTenant(['Zoé']);
  [ana, bob, paul] = team.members as [TenantContext, TenantContext, TenantContext];
  [zoe] = other.members as [TenantContext];
  const setRole = (ctx: TenantContext, role: string) =>
    adminPool.query(`update member set role = $1 where "userId" = $2 and "organizationId" = $3`, [
      role,
      ctx.userId,
      ctx.tenantId,
    ]);
  await setRole(ana, 'owner');
  // Better Auth peut ranger plusieurs rôles séparés par des virgules.
  await setRole(bob, 'member,admin');
  // Être administrateur d'une autre organisation ne donne rien ici.
  await adminPool.query(
    `insert into member ("organizationId", "userId", role, "createdAt") values ($1, $2, 'admin', now())`,
    [zoe.tenantId, paul.userId],
  );
});

const newProject = () => `github.com/acme/depot-${randomUUID()}`;

const choose = (ctx: TenantContext, project: string, acl = [ctx.tenantId]) =>
  withTenant(ctx, (tx) =>
    tx.execute(sql`
      insert into depots_equipe (tenant_id, project, acl, choisi_par)
      values (${ctx.tenantId}, ${project}, ${`{${acl.join(',')}}`}::uuid[], ${ctx.userId})`),
  );

const rechoose = (ctx: TenantContext, project: string) =>
  withTenant(ctx, (tx) =>
    tx.execute(sql`update depots_equipe set choisi_par = ${ctx.userId} where project = ${project}`),
  );

const unchoose = (ctx: TenantContext, project: string) =>
  withTenant(ctx, (tx) => tx.execute(sql`delete from depots_equipe where project = ${project}`));

// Qui a choisi le dépôt, vu par `ctx` (la sécurité par ligne filtre).
async function chosenBy(ctx: TenantContext, project: string): Promise<string[]> {
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<{ choisi_par: string }>(
      sql`select choisi_par from depots_equipe where project = ${project}`,
    ),
  );
  return rows.map((row) => row.choisi_par);
}

describe('depots_equipe', () => {
  it('un membre lit les dépôts de son équipe', async () => {
    const project = newProject();
    await choose(ana, project);

    expect(await chosenBy(paul, project)).toEqual([ana.userId]);
  });

  it('le propriétaire et un administrateur ajoutent, modifient et retirent un dépôt', async () => {
    const project = newProject();
    await choose(ana, project);

    const updated = await rechoose(bob, project);
    expect(updated.rowCount).toBe(1);
    expect(await chosenBy(ana, project)).toEqual([bob.userId]);

    const deleted = await unchoose(ana, project);
    expect(deleted.rowCount).toBe(1);
    expect(await chosenBy(bob, project)).toEqual([]);

    await expect(choose(bob, newProject())).resolves.toBeDefined();
  });

  it('un membre qui écrit reçoit une erreur RLS, et ne modifie ni ne retire rien', async () => {
    await expect(choose(paul, newProject())).rejects.toMatchObject(RLS_ERROR);

    // Postgres ne lève rien pour update et delete : les lignes refusées sont écartées sans bruit.
    const project = newProject();
    await choose(ana, project);
    expect((await rechoose(paul, project)).rowCount).toBe(0);
    expect((await unchoose(paul, project)).rowCount).toBe(0);
    expect(await chosenBy(paul, project)).toEqual([ana.userId]);
  });

  it('une autre organisation ne voit rien', async () => {
    const project = newProject();
    await choose(ana, project);

    expect(await chosenBy(zoe, project)).toEqual([]);
  });

  it("refuse une clé hors de la forme github.com/<propriétaire>/<dépôt>, un doublon et un accès autre que l'équipe", async () => {
    await expect(choose(ana, 'github.com/Acme/Depot')).rejects.toMatchObject({
      cause: { code: '23514' },
    });
    await expect(choose(ana, 'dossier:0123456789abcdef')).rejects.toMatchObject({
      cause: { code: '23514' },
    });
    const project = newProject();
    await choose(ana, project);
    await expect(choose(bob, project)).rejects.toMatchObject({ cause: { code: '23505' } });
    await expect(choose(ana, newProject(), [ana.userId, ana.tenantId])).rejects.toMatchObject({
      cause: { code: '23514' },
    });
  });

  it("les sources GitHub de l'organisation passent par l'index partiel sous RLS", async () => {
    const { rows } = await withTenant(paul, async (tx) => {
      // La base de test est petite : sans cela, Postgres lirait la table entière.
      await tx.execute(sql`set local enable_seqscan = off`);
      return tx.execute<{ 'QUERY PLAN': string }>(sql`
        explain select id from sources
         where kind = 'github' and lower(metadata->'origin'->>'repo') = 'acme/depot'`);
    });

    // Le dépôt n'est qu'un filtre (voir 0047) : la condition d'index est l'organisation. Index Scan ou Bitmap Index
    // Scan, selon les statistiques de la base de test.
    expect(rows.map((row) => row['QUERY PLAN']).join('\n')).toMatch(
      /Index Scan (?:using|on) sources_github_repo_idx .*\n\s*Index Cond: \(tenant_id = /,
    );
  });
});
