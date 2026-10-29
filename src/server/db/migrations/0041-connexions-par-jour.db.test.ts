import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import type { AdminStats } from '@/server/admin/stats';
import { adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { TEST_ENV } from '@/test/test-env';

// Migration 0041 : le journal des connexions compte par session et par jour.

const app = new Pool({ connectionString: TEST_ENV.DATABASE_URL, max: 2 });
afterAll(() => app.end());

async function stats(): Promise<AdminStats> {
  const { rows } = await adminPool.query<{ stats: AdminStats }>(
    'select statistiques_admin() as stats',
  );
  return (rows[0] as { stats: AdminStats }).stats;
}

const connexionsDu = (s: AdminStats, jour: string) =>
  s.parJour.find((d) => d.jour === jour)?.connexions ?? 0;

describe('noter_activite par jour', () => {
  it('compte une session active deux jours différents une fois chacun de ces jours', async () => {
    const { members } = await createTestTenant(['Ada']);
    const user = members[0]?.userId as string;
    const session = randomUUID();

    await app.query('select noter_activite($1, $2)', [session, user]);
    // La même session, mais sa première ligne passe à hier, comme si elle avait servi la veille.
    await adminPool.query(
      `update journal_connexions set jour = jour - 1, debut = debut - interval '1 day',
                                     derniere_activite = now() - interval '1 day'
        where session_id = $1`,
      [session],
    );
    const before = await stats();
    await app.query('select noter_activite($1, $2)', [session, user]);
    const after = await stats();

    const { rows } = await adminPool.query<{ jour: string }>(
      `select to_char(jour, 'YYYY-MM-DD') as jour from journal_connexions where session_id = $1 order by jour`,
      [session],
    );
    expect(rows).toHaveLength(2);
    const [hier, aujourdhui] = rows.map((row) => row.jour) as [string, string];
    expect(connexionsDu(after, hier)).toBeGreaterThanOrEqual(1);
    expect(connexionsDu(after, aujourdhui) - connexionsDu(before, aujourdhui)).toBe(1);
    expect(after.connexions.mois - before.connexions.mois).toBe(1);
  });
});
