import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '@/server/db/migrate';
import { adminPool } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';

// Migration 0088 : brouillons.sorte, « reponse » ou « relance », posée avec la ligne. Les lignes d'avant sont des
// réponses. Données inventées.

// Deux lignes de Paul, comme les écrivait l'agent « Brouillons de réponse » : un brouillon, et un mail jugé sans réponse
// à donner. Rend leurs identifiants.
async function seededLines(): Promise<string[]> {
  const {
    members: [paul],
  } = await createTestTenant(['Paul']);
  if (!paul) throw new Error('membre de test manquant');
  const { sourceId } = await seedSource(paul, { kind: 'gmail' });
  const { rows } = await adminPool.query<{ id: string }>(
    `insert into brouillons (tenant_id, user_id, source_id, message, texte, acl)
     values ($1, $2, $3, 'message:1', 'Bonjour Léa,', array[$2::uuid]),
            ($1, $2, $3, 'message:2', null, array[$2::uuid])
     returning id`,
    [paul.tenantId, paul.userId, sourceId],
  );
  return rows.map((row) => row.id);
}

describe('brouillons.sorte', () => {
  it('est un texte non nul, « reponse » par défaut, « reponse » ou « relance » seulement', async () => {
    const [id] = await seededLines();

    const { rows } = await adminPool.query(
      `select data_type, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'brouillons' and column_name = 'sorte'`,
    );
    expect(rows).toEqual([
      { data_type: 'text', is_nullable: 'NO', column_default: "'reponse'::text" },
    ]);
    const set = (sorte: string | null) =>
      adminPool.query('update brouillons set sorte = $2 where id = $1', [id, sorte]);
    await expect(set('autre')).rejects.toMatchObject({ code: '23514' });
    await expect(set(null)).rejects.toMatchObject({ code: '23502' });
    await expect(set('relance')).resolves.toMatchObject({ rowCount: 1 });
  });

  // La migration rejouée sur une copie remplie de brouillons, dans une transaction annulée : la vraie table n'est pas
  // touchée. Ses lignes prennent « reponse », sans que la table soit réécrite (son fichier ne change pas).
  it('sur une table déjà remplie, ses lignes sont des réponses, sans la réécrire', async () => {
    const ids = await seededLines();
    const migration = await readFile(`${MIGRATIONS_DIR}/0088-brouillon-relance.sql`, 'utf8');
    const client = await adminPool.connect();
    try {
      await client.query('begin');
      await client.query(
        'create temp table brouillons on commit drop as select * from public.brouillons where id = any($1)',
        [ids],
      );
      await client.query('alter table brouillons drop column sorte');
      const file = "select pg_relation_filenode('pg_temp.brouillons') as file";
      const before = (await client.query(file)).rows[0];

      await client.query(migration);

      expect((await client.query(file)).rows[0]).toEqual(before);
      const { rows } = await client.query('select sorte from pg_temp.brouillons');
      expect(rows).toEqual([{ sorte: 'reponse' }, { sorte: 'reponse' }]);
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
});
