import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { readLog } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';
import { dropTeams, newTeam } from '@/test/seed-indexed';
import { seedRun } from '@/test/seed-search';

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

// sources_lues_pendant : les sources que la personne courante a lues pendant ses propres sessions (D35), même devenues
// invisibles pour elle, jamais les lectures d'une autre.
describe('sources_lues_pendant', () => {
  const tenantIds: string[] = [];
  afterAll(() => dropTeams(tenantIds));

  it('rend les lectures de la personne dans la fenêtre de sa session, jamais celles d’une autre ni d’une session d’une autre', async () => {
    const { members } = await newTeam(['Paul', 'Marie'], tenantIds);
    const [paul, marie] = members as [TenantContext, TenantContext];
    const session = async (owner: TenantContext) =>
      (
        await seedRun(owner, {
          turns: [{ text: 'x', ts: new Date('2026-11-05T09:00:00.000Z') }],
        })
      ).sourceId;
    const [mine, hers] = [await session(paul), await session(marie)];
    const lue = (await seedRun(marie, { kind: 'slack', acl: [marie.userId] })).sourceId;
    const autre = (await seedRun(marie, { kind: 'slack', acl: [marie.userId] })).sourceId;
    const at = new Date('2026-11-05T09:05:00.000Z');
    await adminDb.insert(readLog).values([
      // une source que Paul ne voit plus : sa lecture a pris l'accès de la source
      {
        tenantId: paul.tenantId,
        userId: paul.userId,
        client: 'cli',
        tool: 'search',
        sourceId: lue,
        acl: [marie.userId],
        at,
      },
      {
        tenantId: marie.tenantId,
        userId: marie.userId,
        client: 'cli',
        tool: 'search',
        sourceId: autre,
        acl: [marie.userId],
        at,
      },
    ]);
    const lues = (as: TenantContext, sessions: string[]) =>
      withTenant(as, async (tx) =>
        (
          await tx.execute<{ id: string }>(
            sql`select sources_lues_pendant(${`{${sessions.join(',')}}`}::uuid[]) as id`,
          )
        ).rows.map((row) => row.id),
      );

    expect(await lues(paul, [mine])).toEqual([lue]);
    expect(await lues(paul, [hers])).toEqual([]);
    expect(await lues(marie, [hers])).toEqual([autre]);
  });
});
