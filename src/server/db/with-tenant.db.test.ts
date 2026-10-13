import { eq, sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { adminDb } from '@/test/db';
import { seedRightsScenario } from '@/test/rights-scenario';
import { db, pool } from './client';
import { facts } from './schema/memory';
import { withTenant } from './with-tenant';

describe('withTenant', () => {
  it("hors withTenant, aucune ligne de la mémoire n'est visible", async () => {
    const { tenantId } = await seedRightsScenario();
    const count = sql<number>`select count(*)::int as n from facts where tenant_id = ${tenantId}`;
    const asOwner = await adminDb.execute<{ n: number }>(count);
    expect(asOwner.rows[0]?.n).toBeGreaterThan(0);
    const asApp = await db.execute<{ n: number }>(count);
    expect(asApp.rows[0]?.n).toBe(0);
  });

  it('pose le tenant et les principals dans la transaction', async () => {
    const { tenantId, paul } = await seedRightsScenario();
    const settings = await withTenant(paul, async (tx) => {
      const result = await tx.execute<{ tenant: string; principals: string[] }>(
        sql`select current_setting('app.tenant') as tenant, app_principals() as principals`,
      );
      return result.rows[0];
    });
    expect(settings).toEqual({ tenant: tenantId, principals: [paul.userId, tenantId] });
  });

  it('rend au pool des connexions sans contexte', async () => {
    const { paul } = await seedRightsScenario();
    // Autant de transactions que de connexions du pool : chacune a porté un contexte.
    await Promise.all(
      Array.from({ length: 10 }, () => withTenant(paul, (tx) => tx.execute(sql`select 1`))),
    );
    const results = await Promise.all(
      Array.from({ length: 10 }, () => pool.query('select app_tenant() as tenant')),
    );
    for (const result of results) expect(result.rows[0].tenant).toBeNull();
  });

  it("lève avant toute requête si un principal n'est pas un UUID", async () => {
    const { paul } = await seedRightsScenario();
    const fn = vi.fn(async () => 'atteint');
    for (const bad of ['pas-un-uuid', `${paul.tenantId},${paul.userId}`, `${paul.userId}}`]) {
      await expect(withTenant({ ...paul, principals: [paul.userId, bad] }, fn)).rejects.toThrow();
    }
    await expect(withTenant({ ...paul, principals: [] }, fn)).rejects.toThrow();
    await expect(withTenant({ ...paul, tenantId: 'pas-un-uuid' }, fn)).rejects.toThrow();
    expect(fn).not.toHaveBeenCalled();
  });

  it('annule la transaction si fn lève', async () => {
    const { paul, ids } = await seedRightsScenario();
    await expect(
      withTenant(paul, async (tx) => {
        await tx
          .update(facts)
          .set({ statement: 'modifié' })
          .where(eq(facts.id, ids.acmeConflictFact));
        throw new Error('échec voulu');
      }),
    ).rejects.toThrow('échec voulu');

    const [row] = await withTenant(paul, (tx) =>
      tx
        .select({ statement: facts.statement })
        .from(facts)
        .where(eq(facts.id, ids.acmeConflictFact)),
    );
    expect(row?.statement).toBe('ACME paie ses factures à soixante jours.');
  });
});
