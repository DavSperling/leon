import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { adminPool } from '@/test/db';
import { createTestTenant, seedConnection } from '@/test/fixtures';
import { seedPassages, seedRun } from '@/test/seed-search';

// Migration 0013 : les corrections de l'audit du 20/10 sur les lectures des tics (fonctions hors RLS).

const MINUTE = 60_000;
const tenantIds: string[] = [];
let alice: TenantContext;
let leaver: TenantContext;

beforeAll(async () => {
  const team = await createTestTenant(['Alice', 'Départ']);
  [alice, leaver] = team.members as [TenantContext, TenantContext];
  tenantIds.push(team.tenantId);
});

afterAll(async () => {
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
});

// Le membre parti : sa ligne `member` est retirée, ses sources et ses connexions restent.
const leave = (ctx: TenantContext) =>
  adminPool.query('delete from member where "userId" = $1 and "organizationId" = $2', [
    ctx.userId,
    ctx.tenantId,
  ]);

// Audit n° 1 : un propriétaire parti était rendu à chaque tic, sauté sans marque, et occupait la tête de la
// liste (limite 500, 200 ou 100) : derrière lui, plus rien n'avançait.
describe('les tics ignorent les lignes d’un membre parti', () => {
  let departed: { passageIds: string[]; connectionId: string };
  let kept: { passageIds: string[]; connectionId: string };

  beforeAll(async () => {
    const token = `jeton-${randomUUID()}`;
    const past = new Date('2000-01-01T00:00:00Z');
    const seed = async (ctx: TenantContext) => ({
      passageIds: (await seedPassages(ctx, { count: 2, token })).passageIds,
      connectionId: await seedConnection(ctx, { nextSyncAt: past }),
    });
    kept = await seed(alice);
    departed = await seed(leaver);
    await leave(leaver);
  });

  it('passages_sans_vecteur', async () => {
    const { rows } = await db.execute<{ passage_id: string }>(
      sql`select passage_id from passages_sans_vecteur(${`modele-${randomUUID()}`}, 100000)`,
    );
    const ids = new Set(rows.map((row) => row.passage_id));
    for (const id of kept.passageIds) expect(ids.has(id)).toBe(true);
    for (const id of departed.passageIds) expect(ids.has(id)).toBe(false);
  });

  // Les runs sont créés juste avant la lecture : les tests de embed-missing rajeunissent et reprennent, en
  // parallèle, les runs en attente de toute la base.
  it('runs_en_attente', async () => {
    const old = new Date(Date.now() - 60 * MINUTE);
    const keptRun = (await seedRun(alice, { updatedAt: old })).job.ingestRunId;
    const departedRun = (await seedRun(leaver, { updatedAt: old })).job.ingestRunId;

    const { rows } = await db.execute<{ run_id: string }>(
      sql`select run_id from runs_en_attente(5)`,
    );
    const ids = rows.map((row) => row.run_id);
    expect(ids).toContain(keptRun);
    expect(ids).not.toContain(departedRun);
  });

  it('connector_syncs_due', async () => {
    const { rows } = await db.execute<{ connection_id: string }>(
      sql`select connection_id from connector_syncs_due()`,
    );
    const ids = rows.map((row) => row.connection_id);
    expect(ids).toContain(kept.connectionId);
    expect(ids).not.toContain(departed.connectionId);
  });
});

// Audit n° 7 : la recherche par le sens filtre sur l'organisation et le modèle.
it('indexe les vecteurs par organisation et par modèle', async () => {
  const { rows } = await adminPool.query<{ indexdef: string }>(
    `select indexdef from pg_indexes where tablename = 'passage_vectors'`,
  );
  expect(rows.map((row) => row.indexdef)).toContainEqual(
    expect.stringContaining('(tenant_id, model)'),
  );
});

// Audit n° 8 : le tic des vecteurs relisait chaque minute tous les passages (anti-jointure sur toute la table).
// Les passages à vectoriser se trouvent désormais par un index : le plan n'a pas d'autre choix que lui quand
// le parcours complet est écarté.
it('trouve les passages à vectoriser par un index', async () => {
  const client = await adminPool.connect();
  try {
    await client.query('begin');
    await client.query('set local enable_seqscan = off');
    const { rows } = await client.query<{ 'QUERY PLAN': string }>(
      `explain select id from passages
        where embedded_model is null or embedded_model < 'modele' or embedded_model > 'modele'`,
    );
    const plan = rows.map((row) => row['QUERY PLAN']).join('\n');
    expect(plan).toContain('passages_embedded_model_idx');
    expect(plan).not.toContain('Seq Scan');
  } finally {
    await client.query('rollback');
    client.release();
  }
});
