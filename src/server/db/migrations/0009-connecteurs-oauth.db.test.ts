import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';
import { adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';

// Migration 0009 : les quatre nouveaux outils (Basecamp, Miro, Productboard, Outlook) entrent dans les
// listes de types des sources et des connexions. La liste des faits suit celle des sources : le contrat du
// schéma (schema-contract.db.test.ts) compare les trois listes à celles du code.

const NEW_TOOLS = ['basecamp', 'miro', 'productboard', 'outlook'];
const tenantIds: string[] = [];

let paul: TenantContext;

beforeAll(async () => {
  const team = await createTestTenant(['Paul']);
  [paul] = team.members as [TenantContext];
  tenantIds.push(team.tenantId);
});

// Les connexions du tic sont partagées par tous les fichiers de test : on retire les nôtres, et seulement elles.
afterAll(async () => {
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});

async function insertSource(kind: string): Promise<string> {
  const id = randomUUID();
  await withTenant(paul, (tx) =>
    tx.execute(sql`
      insert into sources (id, tenant_id, kind, external_id, owner_user_id, acl)
      values (${id}, ${paul.tenantId}, ${kind}, ${randomUUID()}, ${paul.userId},
              ${`{${paul.tenantId}}`}::uuid[])`),
  );
  return id;
}

// Par le propriétaire (hors sécurité par ligne) : seule la liste des outils est en jeu.
async function insertConnection(provider: string): Promise<void> {
  await adminPool.query(
    `insert into connections (tenant_id, created_by, provider, label, secret, secret_hint, since, acl)
     values ($1, $2, $3, 'Connexion de test', 'v1:aaaa:bbbb:cccc', 'abcd', now(), array[$1::uuid])`,
    [paul.tenantId, paul.userId, provider],
  );
}

describe('sources des nouveaux outils', () => {
  it.each(NEW_TOOLS)('accepte une source %s', async (kind) => {
    await expect(insertSource(kind)).resolves.toEqual(expect.any(String));
  });

  it('refuse un type de source inconnu', async () => {
    await expect(insertSource('inconnu')).rejects.toMatchObject({ cause: { code: '23514' } });
  });
});

describe('connexions des nouveaux outils', () => {
  it.each(NEW_TOOLS)('accepte une connexion %s', async (provider) => {
    await expect(insertConnection(provider)).resolves.toBeUndefined();
  });

  it('refuse un outil inconnu', async () => {
    await expect(insertConnection('slack')).rejects.toMatchObject({ code: '23514' });
  });
});
