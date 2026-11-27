import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '@/server/db/migrate';
import { adminPool } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';

// Migration 0085 : turns.automated, un courrier reçu envoyé par une machine ou en nombre. Nul et sans défaut : un tour
// relevé avant, ou qui n'est pas un courrier, reste « on ne sait pas ».

async function seededTurn(): Promise<string> {
  const {
    members: [paul],
  } = await createTestTenant(['Paul']);
  if (!paul) throw new Error('membre de test manquant');
  return (await seedSource(paul)).turnId;
}

describe('turns.automated', () => {
  it('est un booléen nullable, sans défaut, nul pour un tour écrit sans lui', async () => {
    const turnId = await seededTurn();

    const { rows } = await adminPool.query(
      `select data_type, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'turns' and column_name = 'automated'`,
    );
    expect(rows).toEqual([{ data_type: 'boolean', is_nullable: 'YES', column_default: null }]);
    const stored = await adminPool.query('select automated from turns where id = $1', [turnId]);
    expect(stored.rows).toEqual([{ automated: null }]);
  });

  // La migration rejouée sur une copie remplie de turns, dans une transaction annulée : la vraie table n'est pas
  // verrouillée. Ses tours prennent nul, sans que la table soit réécrite (son fichier ne change pas).
  it('sur une table déjà remplie, laisse ses tours à nul, sans la réécrire', async () => {
    const turnId = await seededTurn();
    const migration = await readFile(`${MIGRATIONS_DIR}/0085-envois-automatiques.sql`, 'utf8');
    const client = await adminPool.connect();
    try {
      await client.query('begin');
      await client.query(
        'create temp table turns on commit drop as select * from public.turns where id = $1',
        [turnId],
      );
      await client.query('alter table turns drop column automated');
      const file = "select pg_relation_filenode('pg_temp.turns') as file";
      const before = (await client.query(file)).rows[0];

      await client.query(migration);

      expect((await client.query(file)).rows[0]).toEqual(before);
      const { rows } = await client.query('select id, automated from pg_temp.turns');
      expect(rows).toEqual([{ id: turnId, automated: null }]);
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
});
