import { describe, expect, it } from 'vitest';
import { adminPool } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';

// Migration 0060 : turns.injecte, la marque des tours `user` que la personne n'a pas tapés (T43 du plan de la mémoire
// à disposition). Nulle et sans défaut : un tour capté avant la marque reste « inconnu », jamais « tapé par la personne ».

describe('turns.injecte', () => {
  it('est un booléen nullable, sans défaut', async () => {
    const { rows } = await adminPool.query<{
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `select data_type, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'turns' and column_name = 'injecte'`,
    );

    expect(rows).toEqual([{ data_type: 'boolean', is_nullable: 'YES', column_default: null }]);
  });

  it('vaut null pour un tour écrit sans elle', async () => {
    const {
      members: [paul],
    } = await createTestTenant(['Paul']);
    if (!paul) throw new Error('membre de test manquant');
    const { turnId } = await seedSource(paul);

    const { rows } = await adminPool.query<{ injecte: boolean | null }>(
      'select injecte from turns where id = $1',
      [turnId],
    );

    expect(rows).toEqual([{ injecte: null }]);
  });
});
