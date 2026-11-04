import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { MIGRATIONS_DIR } from '../migrate';

// Migration 0049 : api_tokens distingue trois sortes de jetons (manuel, ordinateur, assistant) et porte ce qu'il faut
// aux jetons des assistants OAuth : expiration, renouvellement, client, code d'autorisation servi une seule fois.

let paul: TenantContext;

beforeAll(async () => {
  paul = (await createTestTenant(['Paul'])).members[0] as TenantContext;
});

const hash = () => randomUUID().replaceAll('-', '');

// Une ligne comme en écrivait le code d'avant la migration : aucune des nouvelles colonnes.
async function insertLegacyRow(name: string): Promise<string> {
  const { rows } = await adminPool.query<{ id: string }>(
    `insert into api_tokens (tenant_id, user_id, name, token_hash, token_hint)
     values ($1, $2, $3, $4, 'abcd') returning id`,
    [paul.tenantId, paul.userId, name, hash()],
  );
  return (rows[0] as { id: string }).id;
}

async function kindOf(id: string): Promise<string> {
  const { rows } = await adminPool.query<{ kind: string }>(
    'select kind from api_tokens where id = $1',
    [id],
  );
  return (rows[0] as { kind: string }).kind;
}

describe('colonnes de api_tokens', () => {
  it('une ligne sans les nouvelles colonnes vaut manuel, sans expiration ni client', async () => {
    const id = await insertLegacyRow('Mon jeton');

    const { rows } = await adminPool.query(
      `select kind, client_name, client_host, client_ref, grant_id, expires_at, refresh_hash, refresh_expires_at,
             previous_refresh_hash, refresh_rotated_at
         from api_tokens where id = $1`,
      [id],
    );

    expect(rows).toEqual([
      {
        kind: 'manuel',
        client_name: null,
        client_host: null,
        client_ref: null,
        grant_id: null,
        expires_at: null,
        refresh_hash: null,
        refresh_expires_at: null,
        previous_refresh_hash: null,
        refresh_rotated_at: null,
      },
    ]);
  });

  it('refuse une sorte de jeton inconnue', async () => {
    await expect(
      adminPool.query(
        `insert into api_tokens (tenant_id, user_id, name, token_hash, token_hint, kind)
         values ($1, $2, 'x', $3, 'abcd', 'autre')`,
        [paul.tenantId, paul.userId, hash()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it.each(['grant_id', 'refresh_hash', 'previous_refresh_hash'])(
    'refuse deux lignes avec le même %s (un code ne sert qu’une fois)',
    async (column) => {
      const value = hash();
      const insert = () =>
        adminPool.query(
          `insert into api_tokens (tenant_id, user_id, name, token_hash, token_hint, kind, ${column})
         values ($1, $2, 'x', $3, 'abcd', 'assistant', $4)`,
          [paul.tenantId, paul.userId, hash(), value],
        );
      await insert();

      await expect(insert()).rejects.toMatchObject({ code: '23505' });
    },
  );
});

// La migration passe à « ordinateur » les jetons que le lot 1 de la CLI a nommés « Ordinateur : … ». Le test joue
// l'instruction de la migration sur des lignes encore « manuel » : la colonne existe déjà dans la base de test.
describe('lignes existantes', () => {
  it('passe à ordinateur les jetons nommés « Ordinateur : … », et laisse les autres manuel', async () => {
    const sqlText = await readFile(join(MIGRATIONS_DIR, '0049-jetons-assistants.sql'), 'utf8');
    const backfill = sqlText.match(/^update api_tokens\b[^;]*;/m)?.[0];
    expect(backfill).toBeDefined();
    const computer = await insertLegacyRow('Ordinateur : MacBook Paul');
    const manual = await insertLegacyRow('Ordinateur sans deux-points');
    const lookalike = await insertLegacyRow('Mon Ordinateur : x');
    await adminPool.query(backfill as string);

    expect(await kindOf(computer)).toBe('ordinateur');
    expect(await kindOf(manual)).toBe('manuel');
    expect(await kindOf(lookalike)).toBe('manuel');
  });
});
