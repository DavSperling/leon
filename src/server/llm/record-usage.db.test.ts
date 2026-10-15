import { describe, expect, it } from 'vitest';
import { adminPool } from '@/test/db';

describe('llm_usage', () => {
  it('RLS active ; leon_app insère mais ne lit, ne modifie ni ne supprime', async () => {
    const { rows } = await adminPool.query(
      `select relrowsecurity as rls,
              has_table_privilege('leon_app', 'llm_usage', 'INSERT') as can_insert,
              has_table_privilege('leon_app', 'llm_usage', 'SELECT') as can_select,
              has_table_privilege('leon_app', 'llm_usage', 'UPDATE') as can_update,
              has_table_privilege('leon_app', 'llm_usage', 'DELETE') as can_delete
         from pg_class where relname = 'llm_usage' and relkind = 'r'`,
    );
    expect(rows).toEqual([
      { rls: true, can_insert: true, can_select: false, can_update: false, can_delete: false },
    ]);
  });
});
