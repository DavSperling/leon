import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { adminPool } from '@/test/db';
import * as apiTokensSchema from './schema/api-tokens';
import * as authSchema from './schema/auth';
import * as memorySchema from './schema/memory';
import * as tasksSchema from './schema/tasks';

// Contrat « colonnes utilisées ↔ migrations » : chaque colonne Drizzle existe en base sous le même nom.
const tables: PgTable[] = [
  ...Object.values(authSchema),
  ...Object.values(apiTokensSchema),
  ...Object.values(memorySchema),
  ...Object.values(tasksSchema),
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

const enumColumns = tables.flatMap((table) => {
  const { name, columns } = getTableConfig(table);
  return columns
    .filter((column) => column.enumValues !== undefined)
    .map((column) => [`${name}.${column.name}`, name, column.name, column.enumValues] as const);
});

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

  // validity et search_tsv sont lues en SQL à la main, hors Drizzle (T06a, T08).
  it('facts.validity et facts.search_tsv sont des colonnes générées', async () => {
    const { rows } = await adminPool.query<{ column_name: string; is_generated: string }>(
      `select column_name, is_generated from information_schema.columns
        where table_schema = 'public' and table_name = 'facts'
          and column_name in ('validity', 'search_tsv')
        order by column_name`,
    );
    expect(rows).toEqual([
      { column_name: 'search_tsv', is_generated: 'ALWAYS' },
      { column_name: 'validity', is_generated: 'ALWAYS' },
    ]);
  });
});
