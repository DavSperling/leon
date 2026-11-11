import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { adminPool } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';
import { ingestRuns, readLog, turns } from './schema/memory';
import { withTenant } from './with-tenant';

// Les clés étrangères sont vérifiées hors RLS : seules les clés composées (tenant_id, x)
// empêchent une ligne de l'organisation B de pointer vers une ligne de l'organisation A.

type Refs = { sourceId: string; turnId: string };

let bob: TenantContext;
let own: Refs;
let foreign: Refs;

beforeAll(async () => {
  const a = await createTestTenant(['Alice']);
  const b = await createTestTenant(['Bob']);
  const [alice] = a.members;
  [bob] = b.members as [TenantContext];
  if (!alice || !bob) throw new Error('membres de test manquants');
  foreign = await seedSource(alice);
  own = await seedSource(bob);
});

const insertRead = (sourceId: string) =>
  withTenant(bob, (tx) =>
    tx.insert(readLog).values({
      tenantId: bob.tenantId,
      userId: bob.userId,
      client: 'interface',
      tool: 'fetch',
      sourceId,
      acl: [bob.tenantId],
    }),
  );

const insertRun = (refs: Refs) =>
  withTenant(bob, (tx) =>
    tx.insert(ingestRuns).values({
      tenantId: bob.tenantId,
      sourceId: refs.sourceId,
      turnIds: [refs.turnId],
      acl: [bob.userId],
    }),
  );

const insertTurn = (sourceId: string) =>
  withTenant(bob, (tx) =>
    tx.insert(turns).values({
      tenantId: bob.tenantId,
      sourceId,
      externalId: crypto.randomUUID(),
      role: 'user',
      text: 'Tour glissé.',
      ts: new Date(),
      captureMode: 'manual',
      acl: [bob.userId],
    }),
  );

const FOREIGN_KEY_VIOLATION = { cause: { code: '23503' } };

describe('références vers une autre organisation', () => {
  it('accepte une lecture, un run et un tour qui ne pointent que vers sa propre organisation', async () => {
    await expect(insertRead(own.sourceId)).resolves.toBeDefined();
    await expect(insertRun(own)).resolves.toBeDefined();
    await expect(insertTurn(own.sourceId)).resolves.toBeDefined();
  });

  it("refuse une lecture journalisée sur une source de l'autre organisation", async () => {
    await expect(insertRead(foreign.sourceId)).rejects.toMatchObject(FOREIGN_KEY_VIOLATION);
  });

  it("refuse un run d'indexation sur une source de l'autre organisation", async () => {
    await expect(insertRun({ ...own, sourceId: foreign.sourceId })).rejects.toMatchObject(
      FOREIGN_KEY_VIOLATION,
    );
  });

  it("refuse un tour rattaché à une source de l'autre organisation", async () => {
    await expect(insertTurn(foreign.sourceId)).rejects.toMatchObject(FOREIGN_KEY_VIOLATION);
  });
});

// Toutes les clés vers une table du brut, de l'index (0011) ou des leçons (0066), y compris celles que les tests
// ci-dessus n'exercent pas.
const COMPOSITE_KEYS = [
  'ingest_runs.source_id → sources',
  'passage_vectors.passage_id → passages',
  'passages.source_id → sources',
  'passages.turn_id → turns',
  'passages_a_vectoriser.passage_id → passages',
  'rappels_cites.fil_id → sources',
  'read_log.lecon_id → lecons',
  'read_log.source_id → sources',
  'turns.source_id → sources',
  'versions_memoire.lecon_id → lecons',
  'versions_memoire.source_id → sources',
];

describe('clés étrangères composées', () => {
  it('chaque référence vers une table du brut, de l’index ou des leçons porte tenant_id des deux côtés', async () => {
    const { rows } = await adminPool.query<{ source: string; def: string }>(
      `select c.conrelid::regclass::text as source, pg_get_constraintdef(c.oid) as def
         from pg_constraint c
        where c.contype = 'f'
          and c.confrelid::regclass::text in ('sources', 'turns', 'ingest_runs', 'passages', 'lecons')`,
    );
    const keys = rows.map(({ source, def }) => {
      const match = def.match(
        /^FOREIGN KEY \(tenant_id, (\w+)\) REFERENCES (\w+)\(tenant_id, id\)/,
      );
      expect(match, `${source} : ${def}`).not.toBeNull();
      return `${source}.${match?.[1]} → ${match?.[2]}`;
    });
    expect(keys.sort()).toEqual(COMPOSITE_KEYS);
  });
});

describe('journal de lecture en ajout seul', () => {
  it("l'app ne peut pas modifier read_log : 42501", async () => {
    const update = withTenant(bob, (tx) =>
      tx.update(readLog).set({ client: 'autre' }).where(eq(readLog.userId, bob.userId)),
    );
    await expect(update).rejects.toMatchObject({ cause: { code: '42501' } });
  });
});
