import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { pool } from '@/server/db/client';
import { ingestRuns, sources, turns } from '@/server/db/schema/memory';
import { passages, passageVectors } from '@/server/db/schema/search';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';

// Migration 0011 : passages et vecteurs sous la sécurité par ligne, et les deux fonctions des tics.
// Fixtures par le propriétaire (hors sécurité par ligne), lectures sous withTenant ou, pour les fonctions,
// par leon_app sans contexte d'organisation (comme les tics). La base de test est partagée : on ne compte
// jamais toutes les lignes, on cherche les siennes.

const MODEL = 'factice-1024';
const VECTOR = Array.from({ length: 1024 }, (_, index) => (index === 0 ? 1 : 0));
const MINUTE = 60_000;

const tenantIds: string[] = [];
let alice: TenantContext;
let bob: TenantContext;
let zoe: TenantContext;
let teamTenant: string;

beforeAll(async () => {
  const team = await createTestTenant(['Alice', 'Bob']);
  const other = await createTestTenant(['Zoé']);
  [alice, bob] = team.members as [TenantContext, TenantContext];
  [zoe] = other.members as [TenantContext];
  teamTenant = team.tenantId;
  tenantIds.push(team.tenantId, other.tenantId);
});

// Les passages sans vecteur de ces tests ne doivent pas rester dans la file des autres fichiers.
afterAll(async () => {
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
});

type Refs = { sourceId: string; turnId: string };

// Une source d'outil visible de toute l'équipe, dont `owner` est le propriétaire.
async function seedTeamSource(owner: TenantContext): Promise<Refs> {
  const acl = [owner.tenantId];
  const [source] = await adminDb
    .insert(sources)
    .values({
      tenantId: owner.tenantId,
      kind: 'github',
      externalId: randomUUID(),
      ownerUserId: owner.userId,
      title: 'Ticket 12',
      acl,
    })
    .returning({ id: sources.id });
  if (!source) throw new Error('source de test non créée');
  const [turn] = await adminDb
    .insert(turns)
    .values({
      tenantId: owner.tenantId,
      sourceId: source.id,
      externalId: 'body',
      role: 'document',
      text: 'Corps du ticket.',
      ts: new Date(),
      captureMode: 'connector',
      acl,
    })
    .returning({ id: turns.id });
  if (!turn) throw new Error('tour de test non créé');
  return { sourceId: source.id, turnId: turn.id };
}

async function seedPassage(
  tenantId: string,
  refs: Refs,
  input: { acl: string[]; ord?: number },
): Promise<string> {
  const [row] = await adminDb
    .insert(passages)
    .values({
      tenantId,
      sourceId: refs.sourceId,
      turnId: refs.turnId,
      ord: input.ord ?? 0,
      text: 'Le contrat OVH est renouvelé.',
      charStart: 0,
      charEnd: 29,
      ts: new Date(),
      acl: input.acl,
      // Écrit il y a 5 minutes : passages_sans_vecteur laisse à l'indexation ceux de moins de 2 minutes.
      createdAt: new Date(Date.now() - 5 * 60_000),
    })
    .returning({ id: passages.id });
  if (!row) throw new Error('passage de test non créé');
  return row.id;
}

async function seedVector(
  passageId: string,
  input: { tenantId: string; acl: string[]; model?: string },
): Promise<void> {
  await adminDb.insert(passageVectors).values({
    passageId,
    tenantId: input.tenantId,
    model: input.model ?? MODEL,
    embedding: VECTOR,
    acl: input.acl,
  });
}

// Les passages, parmi `ids`, que `ctx` voit.
async function visiblePassages(ctx: TenantContext, ids: string[]): Promise<string[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx.select({ id: passages.id }).from(passages).where(inArray(passages.id, ids)),
  );
  return rows.map((row) => row.id).sort();
}

// Les passages, parmi `ids`, dont `ctx` voit un vecteur.
async function visibleVectors(ctx: TenantContext, ids: string[]): Promise<string[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({ id: passageVectors.passageId })
      .from(passageVectors)
      .where(inArray(passageVectors.passageId, ids)),
  );
  return rows.map((row) => row.id).sort();
}

describe('passages et vecteurs sous la sécurité par ligne', () => {
  let privatePassage: string;
  let teamPassage: string;

  beforeAll(async () => {
    const own = await seedSource(alice, { text: 'Le contrat OVH est renouvelé.' });
    privatePassage = await seedPassage(alice.tenantId, own, { acl: [alice.userId] });
    await seedVector(privatePassage, { tenantId: alice.tenantId, acl: [alice.userId] });
    const team = await seedTeamSource(bob);
    teamPassage = await seedPassage(teamTenant, team, { acl: [teamTenant] });
    await seedVector(teamPassage, { tenantId: teamTenant, acl: [teamTenant] });
  });

  it('un passage d’ACL [alice] est visible d’Alice et invisible de Bob', async () => {
    expect(await visiblePassages(alice, [privatePassage])).toEqual([privatePassage]);
    expect(await visiblePassages(bob, [privatePassage])).toEqual([]);
  });

  it('un passage d’équipe est visible d’Alice et de Bob, jamais d’une autre organisation', async () => {
    expect(await visiblePassages(alice, [teamPassage])).toEqual([teamPassage]);
    expect(await visiblePassages(bob, [teamPassage])).toEqual([teamPassage]);
    expect(await visiblePassages(zoe, [teamPassage, privatePassage])).toEqual([]);
  });

  it('un vecteur suit la même règle que son passage', async () => {
    const both = [privatePassage, teamPassage].sort();
    expect(await visibleVectors(alice, both)).toEqual(both);
    expect(await visibleVectors(bob, both)).toEqual([teamPassage]);
    expect(await visibleVectors(zoe, both)).toEqual([]);
  });

  it('Bob ne peut pas écrire un passage aux droits d’Alice', async () => {
    const team = await seedTeamSource(bob);

    // Source, tour et ordre sont valides : seule la politique (with check) peut refuser. Le message distingue
    // la sécurité par ligne d'un droit d'insertion manquant, qui rendrait aussi 42501.
    await expect(
      withTenant(bob, (tx) =>
        tx.insert(passages).values({
          tenantId: teamTenant,
          sourceId: team.sourceId,
          turnId: team.turnId,
          ord: 0,
          text: 'Passage glissé.',
          charStart: 0,
          charEnd: 15,
          ts: new Date(),
          acl: [alice.userId],
        }),
      ),
    ).rejects.toMatchObject({
      cause: { code: '42501', message: expect.stringMatching(/row-level security/) },
    });
  });

  it('un passage ne peut pas pointer vers la source d’une autre organisation', async () => {
    const team = await seedTeamSource(bob);

    await expect(seedPassage(zoe.tenantId, team, { acl: [zoe.tenantId] })).rejects.toThrow();
  });

  it('supprimer la source supprime ses passages et leurs vecteurs', async () => {
    const team = await seedTeamSource(bob);
    const passageId = await seedPassage(teamTenant, team, { acl: [teamTenant] });
    await seedVector(passageId, { tenantId: teamTenant, acl: [teamTenant] });

    await adminPool.query('delete from sources where id = $1', [team.sourceId]);

    const { rows } = await adminPool.query<{ passages: number; vectors: number }>(
      `select (select count(*)::int from passages where id = $1) as passages,
              (select count(*)::int from passage_vectors where passage_id = $1) as vectors`,
      [passageId],
    );
    expect(rows).toEqual([{ passages: 0, vectors: 0 }]);
  });
});

type FunctionRow = { tenant_id: string; user_id: string };

describe('passages_sans_vecteur', () => {
  // Limite assez haute pour trouver ses passages dans une base partagée.
  async function missing(model: string): Promise<Array<FunctionRow & { passage_id: string }>> {
    const { rows } = await pool.query<FunctionRow & { passage_id: string }>(
      'select passage_id, tenant_id, user_id from passages_sans_vecteur($1, 1000000)',
      [model],
    );
    return rows;
  }

  it('rend les passages sans vecteur de ce modèle, avec le propriétaire de la source', async () => {
    const team = await seedTeamSource(bob);
    const withoutVector = await seedPassage(teamTenant, team, { acl: [teamTenant], ord: 0 });
    const withVector = await seedPassage(teamTenant, team, { acl: [teamTenant], ord: 1 });
    await seedVector(withVector, { tenantId: teamTenant, acl: [teamTenant] });
    const otherModel = await seedPassage(teamTenant, team, { acl: [teamTenant], ord: 2 });
    await seedVector(otherModel, {
      tenantId: teamTenant,
      acl: [teamTenant],
      model: 'autre-modele',
    });

    const rows = new Map((await missing(MODEL)).map((row) => [row.passage_id, row]));

    expect(rows.get(withoutVector)).toEqual({
      passage_id: withoutVector,
      tenant_id: teamTenant,
      user_id: bob.userId,
    });
    expect(rows.has(otherModel)).toBe(true);
    expect(rows.has(withVector)).toBe(false);
  });

  it('rend les passages de toutes les organisations, les plus récents d’abord', async () => {
    const older = await seedPassage(zoe.tenantId, await seedSource(zoe), { acl: [zoe.userId] });
    const newer = await seedPassage(teamTenant, await seedTeamSource(alice), { acl: [teamTenant] });

    const ids = (await missing(MODEL)).map((row) => row.passage_id);

    expect(ids).toContain(older);
    expect(ids).toContain(newer);
    expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older));
  });

  it('respecte la limite demandée', async () => {
    const { rows } = await pool.query("select * from passages_sans_vecteur('factice-1024', 10)");

    expect(rows.length).toBeLessThanOrEqual(10);
  });
});

describe('runs_en_attente', () => {
  async function seedRun(
    owner: TenantContext,
    input: { status: 'queued' | 'running' | 'done'; minutesAgo: number },
  ): Promise<string> {
    const refs = await seedTeamSource(owner);
    const updatedAt = new Date(Date.now() - input.minutesAgo * MINUTE);
    const [run] = await adminDb
      .insert(ingestRuns)
      .values({
        tenantId: owner.tenantId,
        sourceId: refs.sourceId,
        turnIds: [refs.turnId],
        status: input.status,
        acl: [owner.tenantId],
        createdAt: updatedAt,
        updatedAt,
      })
      .returning({ id: ingestRuns.id });
    if (!run) throw new Error('run de test non créé');
    return run.id;
  }

  it('rend les runs en attente depuis plus de 5 minutes, de toutes les organisations', async () => {
    const teamOld = await seedRun(bob, { status: 'queued', minutesAgo: 10 });
    const otherOld = await seedRun(zoe, { status: 'queued', minutesAgo: 6 });
    const recent = await seedRun(bob, { status: 'queued', minutesAgo: 2 });
    const running = await seedRun(bob, { status: 'running', minutesAgo: 10 });
    const done = await seedRun(bob, { status: 'done', minutesAgo: 10 });

    const { rows } = await pool.query<FunctionRow & { run_id: string }>(
      'select run_id, tenant_id, user_id from runs_en_attente(5)',
    );
    const runs = new Map(rows.map((row) => [row.run_id, row]));

    expect(runs.get(teamOld)).toEqual({
      run_id: teamOld,
      tenant_id: teamTenant,
      user_id: bob.userId,
    });
    expect(runs.get(otherOld)).toEqual({
      run_id: otherOld,
      tenant_id: zoe.tenantId,
      user_id: zoe.userId,
    });
    for (const id of [recent, running, done]) expect(runs.has(id), id).toBe(false);
  });
});

describe('droits sur les fonctions des tics', () => {
  const FUNCTIONS = [
    [
      'passages_sans_vecteur(text, integer)',
      'TABLE(passage_id uuid, tenant_id uuid, user_id uuid)',
    ],
    ['runs_en_attente(integer)', 'TABLE(run_id uuid, tenant_id uuid, user_id uuid)'],
  ] as const;

  it.each(FUNCTIONS)('%s ne rend que des identifiants', async (signature, result) => {
    const { rows } = await adminPool.query<{ result: string }>(
      'select pg_get_function_result($1::regprocedure) as result',
      [signature],
    );

    expect(rows).toEqual([{ result }]);
  });

  it.each(FUNCTIONS)(
    '%s ne s’exécute pas pour public, seulement pour leon_app',
    async (signature) => {
      const { rows } = await adminPool.query<{ public_grants: number; app: boolean }>(
        `select (select count(*)::int
                   from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                  where p.oid = $1::regprocedure and a.grantee = 0
                    and a.privilege_type = 'EXECUTE') as public_grants,
                has_function_privilege('leon_app', $1::regprocedure, 'EXECUTE') as app`,
        [signature],
      );

      expect(rows).toEqual([{ public_grants: 0, app: true }]);
    },
  );

  it.each(FUNCTIONS)(
    '%s s’exécute avec les droits du propriétaire, sur le schéma public seulement',
    async (signature) => {
      const { rows } = await adminPool.query<{ prosecdef: boolean; proconfig: string[] }>(
        'select prosecdef, proconfig from pg_proc where oid = $1::regprocedure',
        [signature],
      );

      expect(rows).toEqual([{ prosecdef: true, proconfig: ['search_path=public'] }]);
    },
  );
});
