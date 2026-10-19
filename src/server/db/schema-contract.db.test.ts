import { randomUUID } from 'node:crypto';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import * as apiTokensSchema from './schema/api-tokens';
import * as authSchema from './schema/auth';
import * as connectionsSchema from './schema/connections';
import * as memorySchema from './schema/memory';

// Contrat « colonnes utilisées ↔ migrations » : chaque colonne Drizzle existe en base sous le même nom.
const tables: PgTable[] = [
  ...Object.values(authSchema),
  ...Object.values(apiTokensSchema),
  ...Object.values(connectionsSchema),
  ...Object.values(memorySchema),
];

async function databaseColumns(table: string): Promise<string[]> {
  const { rows } = await adminPool.query<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1`,
    [table],
  );
  return rows.map((row) => row.column_name);
}

// Valeurs autorisées par le CHECK « colonne in (...) », lues dans le catalogue de Postgres.
async function checkValues(table: string, column: string): Promise<string[] | undefined> {
  const { rows } = await adminPool.query<{ def: string }>(
    `select pg_get_constraintdef(c.oid) as def from pg_constraint c
       join pg_class t on t.oid = c.conrelid
      where t.relname = $1 and c.contype = 'c'`,
    [table],
  );
  const def = rows.map((row) => row.def).find((d) => d.includes(`(${column} = ANY`));
  return def?.match(/'[^']*'/g)?.map((literal) => literal.slice(1, -1));
}

// Depuis 0010, la liste des outils se valide dans le code (SOURCE_KINDS, PROVIDER_IDS) : ces deux colonnes
// gardent leur enum côté TypeScript mais n'ont plus de CHECK en base.
const VALIDATED_IN_CODE = new Set(['sources.kind', 'connections.provider']);

const enumColumns = tables.flatMap((table) => {
  const { name, columns } = getTableConfig(table);
  return columns
    .filter((column) => column.enumValues !== undefined)
    .filter((column) => !VALIDATED_IN_CODE.has(`${name}.${column.name}`))
    .map((column) => [`${name}.${column.name}`, name, column.name, column.enumValues] as const);
});

const DROPPED_TABLES = [
  'review_items',
  'facts',
  'fact_candidates',
  'card_aliases',
  'cards',
  'predicates',
  'card_types',
];

describe('schéma Drizzle ↔ migrations', () => {
  it.each(tables.map((table) => [getTableConfig(table).name, table] as const))(
    'les colonnes de %s existent en base',
    async (name, table) => {
      const expected = getTableConfig(table).columns.map((column) => column.name);
      const actual = await databaseColumns(name);
      expect(actual).not.toHaveLength(0);
      for (const column of expected) expect(actual, `${name}.${column}`).toContain(column);
    },
  );

  it.each(enumColumns)(
    "l'enum de %s a les mêmes valeurs que son CHECK",
    async (_label, table, column, enumValues) => {
      const values = await checkValues(table, column);
      expect(values, `CHECK de ${table}.${column}`).toBeDefined();
      expect(new Set(values)).toEqual(new Set(enumValues));
    },
  );
});

describe('suppression du tri (0010)', () => {
  it.each(DROPPED_TABLES)('la table %s n’existe plus', async (table) => {
    const { rows } = await adminPool.query<{ found: string | null }>(
      'select to_regclass($1)::text as found',
      [`public.${table}`],
    );
    expect(rows).toEqual([{ found: null }]);
  });

  it('read_log pointe vers une source et un passage facultatif, plus vers une fiche', async () => {
    const { rows } = await adminPool.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'read_log'
          and column_name in ('card_id', 'source_id', 'passage_id')
        order by column_name`,
    );
    expect(rows).toEqual([
      { column_name: 'passage_id', is_nullable: 'YES' },
      { column_name: 'source_id', is_nullable: 'NO' },
    ]);
  });

  it("ingest_runs n'a plus de colonne triage, et son étape vaut index par défaut", async () => {
    const { rows } = await adminPool.query<{ column_name: string; column_default: string | null }>(
      `select column_name, column_default from information_schema.columns
        where table_schema = 'public' and table_name = 'ingest_runs'
          and column_name in ('triage', 'step')`,
    );
    expect(rows).toEqual([{ column_name: 'step', column_default: "'index'::text" }]);
  });

  it("n'a plus de CHECK sur sources.kind ni sur connections.provider", async () => {
    for (const table of ['sources', 'connections']) {
      const column = table === 'sources' ? 'kind' : 'provider';
      expect(await checkValues(table, column), `${table}.${column}`).toBeUndefined();
    }
  });

  it('accepte au niveau SQL un outil hors liste, validé par le code seulement', async () => {
    const {
      tenantId,
      members: [paul],
    } = await createTestTenant(['Paul']);
    if (!paul) throw new Error('membre de test manquant');
    await expect(
      adminPool.query(
        `insert into sources (tenant_id, kind, external_id, owner_user_id, acl)
         values ($1, 'nouvel_outil', $2, $3, array[$1::uuid])`,
        [tenantId, randomUUID(), paul.userId],
      ),
    ).resolves.toBeDefined();
    await expect(
      adminPool.query(
        `insert into connections (tenant_id, created_by, provider, label, secret, secret_hint, since, acl)
         values ($1, $2, 'nouvel_outil', 'Connexion de test', 'v1:a:b:c', 'abcd', now(), array[$1::uuid])`,
        [tenantId, paul.userId],
      ),
    ).resolves.toBeDefined();
  });
});
