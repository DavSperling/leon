import { eq, isNull, sql } from 'drizzle-orm';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { adminDb, adminPool } from '@/test/db';
import { seedCard, seedFact } from '@/test/fixtures';
import { type RightsScenario, seedRightsScenario } from '@/test/rights-scenario';
import * as memorySchema from './schema/memory';
import {
  cardAliases,
  cards,
  cardTypes,
  factCandidates,
  facts,
  ingestRuns,
  predicates,
  readLog,
  reviewItems,
  sources,
  turns,
} from './schema/memory';
import { withTenant } from './with-tenant';

type Reader = 'paul' | 'marie' | 'zoe';
type IdKey = keyof RightsScenario['ids'];
const READERS: Reader[] = ['paul', 'marie', 'zoe'];

// Tableau de visibilité de C14 : pour chaque ligne du scénario, qui la voit.
const MATRIX: Array<{ name: string; table: PgTable; rows: Array<[IdKey, Reader[]]> }> = [
  {
    name: 'sources',
    table: sources,
    rows: [
      ['paulSource', ['paul']],
      ['marieSource', ['marie']],
    ],
  },
  {
    name: 'turns',
    table: turns,
    rows: [
      ['paulTurn', ['paul']],
      ['marieTurn', ['marie']],
    ],
  },
  { name: 'ingest_runs', table: ingestRuns, rows: [['paulRun', ['paul']]] },
  { name: 'fact_candidates', table: factCandidates, rows: [['paulCandidate', ['paul']]] },
  {
    name: 'cards',
    table: cards,
    rows: [
      ['acmeCard', ['paul', 'marie']],
      ['orionCard', ['paul']],
      ['zoeCard', ['zoe']],
    ],
  },
  {
    name: 'card_aliases',
    table: cardAliases,
    rows: [
      ['acmeTeamAlias', ['paul', 'marie']],
      ['orionAlias', ['paul']],
    ],
  },
  {
    name: 'facts',
    table: facts,
    rows: [
      ['acmeTeamFact', ['paul', 'marie']],
      ['acmeConflictFact', ['paul', 'marie']],
      ['acmePaulFact', ['paul']],
      ['orionFact', ['paul']],
      ['zoeFact', ['zoe']],
    ],
  },
  {
    name: 'review_items',
    table: reviewItems,
    rows: [
      ['paulReview', ['paul']],
      ['teamReview', ['paul', 'marie']],
    ],
  },
  {
    name: 'read_log',
    table: readLog,
    rows: [
      ['paulReadOrion', ['paul']],
      ['marieReadAcme', ['paul', 'marie']],
    ],
  },
  { name: 'card_types', table: cardTypes, rows: [['proposedType', ['paul']]] },
];

let scenario: RightsScenario;
beforeAll(async () => {
  scenario = await seedRightsScenario();
});

async function sees(reader: Reader, table: PgTable, id: string): Promise<boolean> {
  const result = await withTenant(scenario[reader], (tx) =>
    tx.execute(sql`select 1 from ${table} where id = ${id}`),
  );
  return result.rows.length === 1;
}

for (const { name, table, rows } of MATRIX) {
  describe(`RLS de ${name}`, () => {
    const cases = rows.flatMap(([key, visibleTo]) =>
      READERS.map((reader) => [key, reader, visibleTo.includes(reader)] as const),
    );
    it.each(cases)('%s vu par %s : %s', async (key, reader, expected) => {
      expect(await sees(reader, table, scenario.ids[key])).toBe(expected);
    });
  });
}

describe('catalogue', () => {
  it('les types du socle sont visibles des trois tenants', async () => {
    for (const reader of READERS) {
      const rows = await withTenant(scenario[reader], (tx) =>
        tx.select({ slug: cardTypes.slug }).from(cardTypes).where(isNull(cardTypes.tenantId)),
      );
      expect(rows.map((row) => row.slug).sort()).toEqual([
        'client',
        'decision',
        'fournisseur',
        'outil',
        'personne',
        'produit',
        'projet',
        'regle',
      ]);
    }
  });

  it('les prédicats du socle sont visibles sous tout tenant', async () => {
    const all = await adminDb
      .select({ id: predicates.id })
      .from(predicates)
      .where(isNull(predicates.tenantId));
    for (const reader of READERS) {
      const rows = await withTenant(scenario[reader], (tx) =>
        tx
          .select({
            typeSlug: predicates.typeSlug,
            slug: predicates.slug,
            single: predicates.singleValued,
          })
          .from(predicates)
          .where(isNull(predicates.tenantId)),
      );
      expect(rows).toHaveLength(all.length);
      expect(rows).toContainEqual({ typeSlug: 'client', slug: 'paiement', single: true });
      expect(rows).toContainEqual({ typeSlug: 'client', slug: 'note', single: false });
    }
  });
});

describe("refus d'écriture", () => {
  it('Marie ne modifie pas le fait privé de Paul : 0 ligne', async () => {
    const updated = await withTenant(scenario.marie, (tx) =>
      tx
        .update(facts)
        .set({ statement: 'x' })
        .where(eq(facts.id, scenario.ids.acmePaulFact))
        .returning({ id: facts.id }),
    );
    expect(updated).toHaveLength(0);
    const [row] = await adminDb
      .select({ statement: facts.statement })
      .from(facts)
      .where(eq(facts.id, scenario.ids.acmePaulFact));
    expect(row?.statement).toBe('Le contrat ACME contient une clause zanzibar confidentielle.');
  });

  it("Marie n'insère pas un fait d'ACL [paul] : 42501", async () => {
    const { marie, paul, ids } = scenario;
    const insert = withTenant(marie, (tx) =>
      tx.insert(facts).values({
        tenantId: marie.tenantId,
        cardId: ids.acmeCard,
        predicate: 'note',
        statement: 'Fait glissé chez Paul.',
        quote: 'Fait glissé chez Paul.',
        sourceId: ids.marieSource,
        turnId: ids.marieTurn,
        quoteStart: 0,
        quoteEnd: 10,
        sourceKind: 'chatgpt',
        authorId: marie.userId,
        validFrom: new Date(),
        status: 'active',
        sensitivity: 'shareable',
        singleValued: false,
        confidence: 0.9,
        acl: [paul.userId],
      }),
    );
    await expect(insert).rejects.toMatchObject({ cause: { code: '42501' } });
  });

  it("Marie n'insère pas de ligne dans le tenant de Zoé : 42501", async () => {
    const { marie, otherTenantId } = scenario;
    const insert = withTenant(marie, (tx) =>
      tx.insert(sources).values({
        tenantId: otherTenantId,
        kind: 'chatgpt',
        externalId: crypto.randomUUID(),
        ownerUserId: marie.userId,
        acl: [marie.userId],
      }),
    );
    await expect(insert).rejects.toMatchObject({ cause: { code: '42501' } });
  });

  it("l'app n'a pas le droit de supprimer : 42501", async () => {
    const remove = withTenant(scenario.paul, (tx) =>
      tx.delete(facts).where(eq(facts.id, scenario.ids.acmeTeamFact)),
    );
    await expect(remove).rejects.toMatchObject({ cause: { code: '42501' } });
  });
});

describe('une seule valeur active (D5)', () => {
  async function seedTwoActiveValues(acl: (s: RightsScenario) => string[]): Promise<void> {
    const own = await seedRightsScenario();
    const cardId = await seedCard(own.tenantId, {
      title: 'Tarifs',
      typeSlug: 'client',
      acl: [own.tenantId],
    });
    const base = {
      cardId,
      sourceId: own.ids.paulSource,
      turnId: own.ids.paulTurn,
      authorId: own.paul.userId,
      predicate: 'tarif',
      singleValued: true,
      acl: acl(own),
    };
    await seedFact(own.tenantId, {
      ...base,
      statement: 'Tarif de 100 euros.',
      validFrom: new Date('2026-01-01'),
    });
    await seedFact(own.tenantId, {
      ...base,
      statement: 'Tarif de 120 euros.',
      validFrom: new Date('2026-06-01'),
    });
  }

  it("refuse deux faits actifs d'équipe qui se chevauchent : 23P01", async () => {
    await expect(seedTwoActiveValues((s) => [s.tenantId])).rejects.toMatchObject({
      cause: { code: '23P01' },
    });
  });

  it('accepte deux faits actifs privés qui se chevauchent', async () => {
    await expect(seedTwoActiveValues((s) => [s.paul.userId])).resolves.toBeUndefined();
  });
});

// Toute table de la mémoire, y compris une table ajoutée plus tard.
describe('RLS et droits de leon_app sur la mémoire', () => {
  it.each(Object.values(memorySchema).map((table) => getTableConfig(table).name))(
    '%s : RLS active, ni delete ni truncate',
    async (name) => {
      const { rows } = await adminPool.query(
        `select relrowsecurity as rls,
                has_table_privilege('leon_app', $1, 'DELETE') as can_delete,
                has_table_privilege('leon_app', $1, 'TRUNCATE') as can_truncate
           from pg_class where relname = $1 and relkind = 'r'`,
        [name],
      );
      expect(rows).toEqual([{ rls: true, can_delete: false, can_truncate: false }]);
    },
  );
});
