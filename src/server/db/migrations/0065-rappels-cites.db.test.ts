import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { withTenant } from '@/server/db/with-tenant';
import { adminPool } from '@/test/db';
import { createTestTenant, seedThread } from '@/test/fixtures';

// Migration 0065 : rappels_cites garde les fils déjà rappelés dans une session (D26, T48 du plan de la mémoire à
// disposition), privés à leur auteur, sans mise à jour ni suppression par l'app ; purger_rappels_cites() retire ce qui
// a plus de 24 h.

async function pair(): Promise<[TenantContext, TenantContext]> {
  const { members } = await createTestTenant(['Alice', 'Bob']);
  return members as [TenantContext, TenantContext];
}

// Une ligne posée par le propriétaire (hors RLS), vieille de `heures`.
const insertCite = (ctx: TenantContext, filId: string, heures = 0, acl = [ctx.userId]) =>
  adminPool.query(
    `insert into rappels_cites (tenant_id, owner_user_id, session, fil_id, acl, cree_le)
     values ($1, $2, 's1', $3, $4::uuid[], now() - make_interval(hours => $5))`,
    [ctx.tenantId, ctx.userId, filId, acl, heures],
  );
const cites = async (filId: string) =>
  (await adminPool.query('select 1 from rappels_cites where fil_id = $1', [filId])).rowCount;

describe('rappels_cites', () => {
  it('la ligne d’un collègue est introuvable', async () => {
    const [alice, bob] = await pair();
    const fil = await seedThread(alice);
    await insertCite(alice, fil);

    const read = (ctx: TenantContext) =>
      withTenant(ctx, (tx) =>
        tx.execute(sql`select fil_id from rappels_cites where fil_id = ${fil}`),
      );

    expect((await read(bob)).rows).toEqual([]);
    expect((await read(alice)).rows).toHaveLength(1);
  });

  it('une ACL élargie est refusée, et le même fil ne se cite pas deux fois dans une session', async () => {
    const [alice] = await pair();
    const fil = await seedThread(alice);

    await expect(insertCite(alice, fil, 0, [alice.userId, alice.tenantId])).rejects.toMatchObject({
      code: '23514',
    });
    await insertCite(alice, fil);
    await expect(insertCite(alice, fil)).rejects.toMatchObject({ code: '23505' });
  });

  it('l’app ne met pas à jour et ne supprime pas', async () => {
    const [alice] = await pair();
    const fil = await seedThread(alice);
    await insertCite(alice, fil);

    for (const statement of [
      sql`update rappels_cites set session = 's2' where fil_id = ${fil}`,
      sql`delete from rappels_cites where fil_id = ${fil}`,
    ]) {
      await expect(withTenant(alice, (tx) => tx.execute(statement))).rejects.toMatchObject({
        cause: { code: '42501' },
      });
    }
  });

  it('purger_rappels_cites() retire les lignes de plus de 24 h, et seulement elles', async () => {
    const [alice] = await pair();
    const [vieux, recent] = [await seedThread(alice), await seedThread(alice)];
    await insertCite(alice, vieux, 25);
    await insertCite(alice, recent, 23);

    // Comme le worker : en leon_app, sans contexte d'organisation.
    const { rows } = await db.execute<{ n: number }>(sql`select purger_rappels_cites() as n`);

    expect(rows[0]?.n).toBeGreaterThanOrEqual(1);
    expect(await cites(vieux)).toBe(0);
    expect(await cites(recent)).toBe(1);
  });

  it('une ligne part avec son fil', async () => {
    const [alice] = await pair();
    const fil = await seedThread(alice);
    await insertCite(alice, fil);

    await withTenant(alice, (tx) => tx.execute(sql`select supprimer_fil(${fil})`));

    expect(await cites(fil)).toBe(0);
  });
});
