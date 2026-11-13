import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { members } from '@/server/db/schema/auth';
import { adminDb } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';

// Migration 0068 : le réglage `noter` du compte (T65, C16 du plan de la mémoire à disposition), une colonne datée de
// `member`, nulle par défaut, comme "onboardedAt" (0043). Ajoutée sans défaut, elle est nulle pour les membres déjà là :
// tous gardent `remember`, comme un membre neuf.

describe('0068-noter-refuse', () => {
  it('ajoute "noterRefuseLe", un timestamptz qui accepte null, sans défaut', async () => {
    const { rows } = await adminDb.execute(sql`
      select data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = 'member' and column_name = 'noterRefuseLe'`);

    expect(rows).toEqual([
      { data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null },
    ]);
  });

  it('un membre neuf a la colonne nulle', async () => {
    const { tenantId } = await createTestTenant(['Alice', 'Bob']);

    const rows = await adminDb
      .select({ noterRefuseLe: members.noterRefuseLe })
      .from(members)
      .where(eq(members.organizationId, tenantId));

    expect(rows).toEqual([{ noterRefuseLe: null }, { noterRefuseLe: null }]);
  });
});
