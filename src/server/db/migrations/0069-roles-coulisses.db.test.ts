import { describe, expect, it } from 'vitest';
import { TURN_ROLES } from '@/capture/turn';
import { adminPool } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';

// Migration 0069 : turns accepte les trois rôles des coulisses (T51, D29 et C10 du plan de la mémoire à disposition), en
// gardant les quatre rôles d'avant.

// Insère un tour du rôle donné dans une session de test, puis annule.
async function insertRole(role: string): Promise<void> {
  const {
    members: [paul],
  } = await createTestTenant(['Paul']);
  if (!paul) throw new Error('membre de test manquant');
  const { sourceId } = await seedSource(paul);
  const client = await adminPool.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into turns (tenant_id, source_id, external_id, role, text, ts, capture_mode, acl)
       values ($1, $2, gen_random_uuid()::text, $3, 'Tour de test.', now(), 'file', array[$4::uuid])`,
      [paul.tenantId, sourceId, role, paul.userId],
    );
  } finally {
    await client.query('rollback');
    client.release();
  }
}

describe('turns.role', () => {
  it.each([...TURN_ROLES])('accepte %s', async (role) => {
    await expect(insertRole(role)).resolves.toBeUndefined();
  });

  it('refuse un rôle inconnu', async () => {
    await expect(insertRole('coulisse')).rejects.toThrow(/turns_role_check/);
  });

  // La contrainte est posée sans relire la table (not valid) : elle vaut pour toute écriture neuve.
  it('garde le nom turns_role_check, une seule contrainte sur le rôle', async () => {
    const { rows } = await adminPool.query<{ name: string }>(
      `select conname as name from pg_constraint
        where conrelid = 'public.turns'::regclass and contype = 'c'
          and pg_get_constraintdef(oid) like '%role%'`,
    );
    expect(rows).toEqual([{ name: 'turns_role_check' }]);
  });
});
