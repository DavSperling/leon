import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import type { AdminStats } from '@/server/admin/stats';
import { adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { TEST_ENV } from '@/test/test-env';

// Migration 0039 : le journal des connexions, le coût des appels au modèle, et les chiffres du tableau des admins.

const app = new Pool({ connectionString: TEST_ENV.DATABASE_URL, max: 2 });
afterAll(() => app.end());

const note = (session: string, user: string) =>
  app.query('select noter_activite($1, $2)', [session, user]);

async function journal(session: string) {
  const { rows } = await adminPool.query<{ secondes: number }>(
    'select extract(epoch from temps_actif)::int as secondes from journal_connexions where session_id = $1',
    [session],
  );
  return rows[0];
}

// Recule la dernière activité de la session, comme si la requête précédente datait d'avant.
const back = (session: string, interval: string) =>
  adminPool.query(
    `update journal_connexions set derniere_activite = now() - $2::interval where session_id = $1`,
    [session, interval],
  );

describe('noter_activite', () => {
  it('ouvre la ligne, compte un écart court, ignore une pause et une requête trop proche', async () => {
    const { members } = await createTestTenant(['Ada']);
    const user = members[0]?.userId as string;
    const session = randomUUID();

    await note(session, user);
    expect(await journal(session)).toEqual({ secondes: 0 });

    await back(session, '10 minutes');
    await note(session, user);
    expect(await journal(session)).toEqual({ secondes: 600 });

    await note(session, user); // moins d'une minute après : rien ne change
    expect(await journal(session)).toEqual({ secondes: 600 });

    await back(session, '2 hours');
    await note(session, user);
    expect(await journal(session)).toEqual({ secondes: 600 });
  });

  it("l'app n'écrit dans llm_usage que par insert, et ne lit pas le journal", async () => {
    await expect(
      app.query(
        `insert into llm_usage (step, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                                cost_usd) values ('reponse', 'claude-haiku-5-5', 1, 1, 0, 0, 0.001)`,
      ),
    ).resolves.toBeDefined();
    await expect(app.query('select * from llm_usage')).rejects.toThrow(/permission/);
    await expect(app.query('select * from journal_connexions')).rejects.toThrow(/permission/);
  });
});

describe('statistiques_admin', () => {
  it("compte l'organisation, ses membres, ses questions et le coût", async () => {
    const { tenantId, members } = await createTestTenant(['Bea', 'Cid']);
    const bea = members[0] as { userId: string };
    const name = `Org ${randomUUID()}`;
    await adminPool.query('update organization set name = $2 where id = $1', [tenantId, name]);
    const { rows } = await adminPool.query<{ id: string }>(
      `insert into discussions (tenant_id, user_id, title, acl) values ($1, $2, 'T', array[$2::uuid]) returning id`,
      [tenantId, bea.userId],
    );
    await adminPool.query(
      `insert into discussion_messages (tenant_id, discussion_id, role, content, acl)
       values ($1, $2, 'user', 'Q1', array[$3::uuid]), ($1, $2, 'user', 'Q2', array[$3::uuid]),
              ($1, $2, 'assistant', 'R', array[$3::uuid])`,
      [tenantId, rows[0]?.id, bea.userId],
    );
    await note(randomUUID(), bea.userId);

    const before = await stats();
    await adminPool.query(
      `insert into llm_usage (step, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                              cost_usd) values ('discussion', 'claude-opus-5-5', 10, 10, 0, 0, 1.5)`,
    );
    const after = await stats();

    expect(after.listeOrganisations.find((o) => o.nom === name)).toMatchObject({
      membres: 2,
      questions: 2,
      questions30: 2,
      connecteurs: 0,
    });
    expect(after.couts.total - before.couts.total).toBeCloseTo(1.5);
    expect(after.parJour).toHaveLength(30);
    expect(after.utilisateurs.total).toBeGreaterThanOrEqual(2);
  });

  it("l'app peut l'appeler", async () => {
    const { rows } = await app.query<{ stats: AdminStats }>('select statistiques_admin() as stats');
    expect(rows[0]?.stats.parJour).toHaveLength(30);
  });
});

async function stats(): Promise<AdminStats> {
  const { rows } = await adminPool.query<{ stats: AdminStats }>(
    'select statistiques_admin() as stats',
  );
  return (rows[0] as { stats: AdminStats }).stats;
}
