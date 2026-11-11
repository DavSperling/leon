import { describe, expect, it } from 'vitest';
import { createApiToken } from '@/server/auth/api-tokens';
import { adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';

// Migration 0063 : api_tokens.retraits, la date du dernier retrait de chaque outil sur ce jeton (T43, amendé le 10/11).
// Un jeton d'avant, ou qui n'a jamais retiré d'outil, a {} : aucun envoi de faits n'y perd ses usages.

describe('api_tokens.retraits', () => {
  it('est un jsonb non nul, {} par défaut', async () => {
    const { rows } = await adminPool.query<{
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `select data_type, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'api_tokens' and column_name = 'retraits'`,
    );

    expect(rows).toEqual([
      { data_type: 'jsonb', is_nullable: 'NO', column_default: "'{}'::jsonb" },
    ]);
  });

  it('vaut {} pour un jeton créé sans elle', async () => {
    const {
      members: [paul],
    } = await createTestTenant(['Paul']);
    if (!paul) throw new Error('membre de test manquant');
    const { id } = await createApiToken(paul, 'test');

    const { rows } = await adminPool.query('select retraits from api_tokens where id = $1', [id]);

    expect(rows).toEqual([{ retraits: {} }]);
  });
});
