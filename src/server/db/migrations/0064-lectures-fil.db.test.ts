import { beforeAll, describe, expect, it } from 'vitest';
import { adminPool } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';

// Migration 0064 : read_log note les lectures des fils (`threads`, `thread`, T44) et des versions (`versions`, T54),
// et la session de l'outil où chacune a eu lieu, quand elle est connue (D27, D35).

let reader: { tenantId: string; userId: string; sourceId: string };
beforeAll(async () => {
  const {
    members: [paul],
  } = await createTestTenant(['Paul Martin']);
  if (!paul) throw new Error('membre de test manquant');
  const { sourceId } = await seedSource(paul);
  reader = { tenantId: paul.tenantId, userId: paul.userId, sourceId };
});

// Insère une lecture, puis annule : ces lignes d'essai ne restent pas au journal.
async function insertRead(tool: string, session: string | null = null): Promise<void> {
  const client = await adminPool.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into read_log (tenant_id, user_id, client, tool, source_id, acl, session)
       values ($1, $2, 'cli', $3, $4, array[$2::uuid], $5)`,
      [reader.tenantId, reader.userId, tool, reader.sourceId, session],
    );
  } finally {
    await client.query('rollback');
    client.release();
  }
}

describe('read_log.tool', () => {
  it.each(['fetch', 'search', 'briefing', 'threads', 'thread', 'versions'])(
    'accepte %s',
    async (tool) => {
      await expect(insertRead(tool)).resolves.toBeUndefined();
    },
  );

  it('refuse un outil inconnu', async () => {
    await expect(insertRead('lecons')).rejects.toThrow(/read_log_tool_check/);
  });
});

describe('read_log.session', () => {
  it.each([
    ['absente', null],
    ['d’un caractère', 's'],
    ['de 200 caractères', 's'.repeat(200)],
  ])('accepte une session %s', async (_label, session) => {
    await expect(insertRead('thread', session)).resolves.toBeUndefined();
  });

  it.each([
    ['vide', ''],
    ['de 201 caractères', 's'.repeat(201)],
  ])('refuse une session %s', async (_label, session) => {
    await expect(insertRead('thread', session)).rejects.toThrow(/read_log_session_check/);
  });
});
