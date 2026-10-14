import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { adminPool } from '@/test/db';
import { createTestTenant, seedCard, seedSource } from '@/test/fixtures';
import { cardAliases, facts, readLog, turns } from './schema/memory';
import { withTenant } from './with-tenant';

// Les clés étrangères sont vérifiées hors RLS : seules les clés composées (tenant_id, x)
// empêchent une ligne de l'organisation B de pointer vers une ligne de l'organisation A.

type Refs = { cardId: string; sourceId: string; turnId: string };

let bob: TenantContext;
let own: Refs;
let foreign: Refs;

async function seedRefs(ctx: TenantContext): Promise<Refs> {
  const { sourceId, turnId } = await seedSource(ctx);
  const cardId = await seedCard(ctx.tenantId, {
    title: 'Fiche',
    typeSlug: 'client',
    acl: [ctx.tenantId],
  });
  return { cardId, sourceId, turnId };
}

beforeAll(async () => {
  const a = await createTestTenant(['Alice']);
  const b = await createTestTenant(['Bob']);
  const [alice] = a.members;
  [bob] = b.members as [TenantContext];
  if (!alice || !bob) throw new Error('membres de test manquants');
  foreign = await seedRefs(alice);
  own = await seedRefs(bob);
});

function insertFact(refs: Refs) {
  return withTenant(bob, (tx) =>
    tx.insert(facts).values({
      tenantId: bob.tenantId,
      cardId: refs.cardId,
      predicate: 'note',
      statement: 'Fait de test.',
      quote: 'Fait de test.',
      sourceId: refs.sourceId,
      turnId: refs.turnId,
      quoteStart: 0,
      quoteEnd: 4,
      sourceKind: 'claude_code',
      authorId: bob.userId,
      validFrom: new Date(),
      status: 'active',
      sensitivity: 'shareable',
      singleValued: false,
      confidence: 0.9,
      acl: [bob.tenantId],
    }),
  );
}

const FOREIGN_KEY_VIOLATION = { cause: { code: '23503' } };

describe('références vers une autre organisation', () => {
  it('accepte un fait qui ne pointe que vers sa propre organisation', async () => {
    await expect(insertFact(own)).resolves.toBeDefined();
  });

  it.each(['cardId', 'sourceId', 'turnId'] as const)(
    "refuse un fait dont %s appartient à l'autre organisation",
    async (key) => {
      await expect(insertFact({ ...own, [key]: foreign[key] })).rejects.toMatchObject(
        FOREIGN_KEY_VIOLATION,
      );
    },
  );

  it("refuse un alias sur une fiche de l'autre organisation", async () => {
    const insert = withTenant(bob, (tx) =>
      tx.insert(cardAliases).values({
        tenantId: bob.tenantId,
        cardId: foreign.cardId,
        alias: 'acme.fr',
        kind: 'domain',
        acl: [bob.tenantId],
      }),
    );
    await expect(insert).rejects.toMatchObject(FOREIGN_KEY_VIOLATION);
  });

  it("refuse une lecture journalisée sur une fiche de l'autre organisation", async () => {
    const insert = withTenant(bob, (tx) =>
      tx.insert(readLog).values({
        tenantId: bob.tenantId,
        userId: bob.userId,
        client: 'interface',
        cardId: foreign.cardId,
        acl: [bob.tenantId],
      }),
    );
    await expect(insert).rejects.toMatchObject(FOREIGN_KEY_VIOLATION);
  });

  it("refuse un tour rattaché à une source de l'autre organisation", async () => {
    const insert = withTenant(bob, (tx) =>
      tx.insert(turns).values({
        tenantId: bob.tenantId,
        sourceId: foreign.sourceId,
        externalId: crypto.randomUUID(),
        role: 'user',
        text: 'Tour glissé.',
        ts: new Date(),
        captureMode: 'manual',
        acl: [bob.userId],
      }),
    );
    await expect(insert).rejects.toMatchObject(FOREIGN_KEY_VIOLATION);
  });
});

// Toutes les clés vers une table de la mémoire, y compris celles que les tests ci-dessus n'exercent pas.
const COMPOSITE_KEYS = [
  'card_aliases.card_id → cards',
  'cards.merged_into → cards',
  'fact_candidates.ingest_run_id → ingest_runs',
  'fact_candidates.turn_id → turns',
  'facts.candidate_id → fact_candidates',
  'facts.card_id → cards',
  'facts.source_id → sources',
  'facts.superseded_by → facts',
  'facts.turn_id → turns',
  'ingest_runs.source_id → sources',
  'read_log.card_id → cards',
  'turns.source_id → sources',
];

describe('clés étrangères composées', () => {
  it('chaque référence vers une table de la mémoire porte tenant_id des deux côtés', async () => {
    const { rows } = await adminPool.query<{ source: string; def: string }>(
      `select c.conrelid::regclass::text as source, pg_get_constraintdef(c.oid) as def
         from pg_constraint c
        where c.contype = 'f'
          and c.confrelid::regclass::text in
            ('sources', 'turns', 'ingest_runs', 'fact_candidates', 'cards', 'facts')`,
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
