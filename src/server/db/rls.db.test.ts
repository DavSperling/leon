import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';
import * as memorySchema from './schema/memory';
import { ingestRuns, readLog, sources, turns } from './schema/memory';
import { withTenant } from './with-tenant';

type Reader = 'paul' | 'marie' | 'zoe';
const READERS: Reader[] = ['paul', 'marie', 'zoe'];

// Paul et Marie sont dans la même organisation, Zoé dans une autre. Chacun a une source privée ; une source
// d'outil est visible de toute l'équipe de Paul et de Marie.
type Scenario = {
  tenantId: string;
  otherTenantId: string;
  paul: TenantContext;
  marie: TenantContext;
  zoe: TenantContext;
  ids: Record<
    | 'paulSource'
    | 'marieSource'
    | 'teamSource'
    | 'zoeSource'
    | 'paulTurn'
    | 'marieTurn'
    | 'teamTurn'
    | 'paulRun'
    | 'teamRun'
    | 'paulRead'
    | 'teamRead',
    string
  >;
};

async function insertedId(query: Promise<Array<{ id: string }>>): Promise<string> {
  const [row] = await query;
  if (!row) throw new Error('ligne du scénario non créée');
  return row.id;
}

async function seedScenario(): Promise<Scenario> {
  const team = await createTestTenant(['Paul Martin', 'Marie Durand']);
  const other = await createTestTenant(['Zoé Bernard']);
  const [paul, marie] = team.members as [TenantContext, TenantContext];
  const [zoe] = other.members as [TenantContext];
  const paulSource = await seedSource(paul, { kind: 'claude_code', title: 'Session ACME' });
  const marieSource = await seedSource(marie, { kind: 'chatgpt', title: 'Relance ACME' });
  const zoeSource = await seedSource(zoe, { kind: 'chatgpt', title: 'Relance ACME' });
  const teamAcl = [team.tenantId];
  const teamSource = await insertedId(
    adminDb
      .insert(sources)
      .values({
        tenantId: team.tenantId,
        kind: 'github',
        externalId: randomUUID(),
        ownerUserId: paul.userId,
        title: 'Ticket 12',
        acl: teamAcl,
      })
      .returning({ id: sources.id }),
  );
  const teamTurn = await insertedId(
    adminDb
      .insert(turns)
      .values({
        tenantId: team.tenantId,
        sourceId: teamSource,
        externalId: 'body',
        role: 'document',
        text: 'Corps du ticket.',
        ts: new Date(),
        captureMode: 'connector',
        acl: teamAcl,
      })
      .returning({ id: turns.id }),
  );
  const run = (sourceId: string, turnId: string, acl: string[]) =>
    insertedId(
      adminDb
        .insert(ingestRuns)
        .values({ tenantId: team.tenantId, sourceId, turnIds: [turnId], acl })
        .returning({ id: ingestRuns.id }),
    );
  const read = (ctx: TenantContext, sourceId: string, acl: string[]) =>
    insertedId(
      adminDb
        .insert(readLog)
        .values({
          tenantId: team.tenantId,
          userId: ctx.userId,
          client: 'claude-code',
          tool: 'fetch',
          sourceId,
          acl,
        })
        .returning({ id: readLog.id }),
    );
  return {
    tenantId: team.tenantId,
    otherTenantId: other.tenantId,
    paul,
    marie,
    zoe,
    ids: {
      paulSource: paulSource.sourceId,
      marieSource: marieSource.sourceId,
      teamSource,
      zoeSource: zoeSource.sourceId,
      paulTurn: paulSource.turnId,
      marieTurn: marieSource.turnId,
      teamTurn,
      paulRun: await run(paulSource.sourceId, paulSource.turnId, [paul.userId]),
      teamRun: await run(teamSource, teamTurn, teamAcl),
      paulRead: await read(paul, paulSource.sourceId, [paul.userId]),
      teamRead: await read(marie, teamSource, teamAcl),
    },
  };
}

type IdKey = keyof Scenario['ids'];

// Tableau de visibilité : pour chaque ligne du scénario, qui la voit.
const MATRIX: Array<{ name: string; table: PgTable; rows: Array<[IdKey, Reader[]]> }> = [
  {
    name: 'sources',
    table: sources,
    rows: [
      ['paulSource', ['paul']],
      ['marieSource', ['marie']],
      ['teamSource', ['paul', 'marie']],
      ['zoeSource', ['zoe']],
    ],
  },
  {
    name: 'turns',
    table: turns,
    rows: [
      ['paulTurn', ['paul']],
      ['marieTurn', ['marie']],
      ['teamTurn', ['paul', 'marie']],
    ],
  },
  {
    name: 'ingest_runs',
    table: ingestRuns,
    rows: [
      ['paulRun', ['paul']],
      ['teamRun', ['paul', 'marie']],
    ],
  },
  {
    name: 'read_log',
    table: readLog,
    rows: [
      ['paulRead', ['paul']],
      ['teamRead', ['paul', 'marie']],
    ],
  },
];

let scenario: Scenario;
beforeAll(async () => {
  scenario = await seedScenario();
});

async function sees(reader: Reader, table: PgTable, id: string): Promise<boolean> {
  const result = await withTenant(scenario[reader], (tx) =>
    tx.execute(sql`select 1 from ${table} where id = ${id}`),
  );
  return result.rows.length === 1;
}

for (const { name, table, rows } of MATRIX) {
  describe(`RLS de ${name}`, () => {
    const cases = rows.flatMap(([key, visibleTo]) =>
      READERS.map((reader) => [key, reader, visibleTo.includes(reader)] as const),
    );
    it.each(cases)('%s vu par %s : %s', async (key, reader, expected) => {
      expect(await sees(reader, table, scenario.ids[key])).toBe(expected);
    });
  });
}

describe("refus d'écriture", () => {
  it('Marie ne modifie pas la source privée de Paul : 0 ligne', async () => {
    const updated = await withTenant(scenario.marie, (tx) =>
      tx
        .update(sources)
        .set({ title: 'x' })
        .where(eq(sources.id, scenario.ids.paulSource))
        .returning({ id: sources.id }),
    );
    expect(updated).toHaveLength(0);
    const [row] = await adminDb
      .select({ title: sources.title })
      .from(sources)
      .where(eq(sources.id, scenario.ids.paulSource));
    expect(row?.title).toBe('Session ACME');
  });

  it("Marie n'insère pas un tour d'ACL [paul] : 42501", async () => {
    const { marie, paul, ids } = scenario;
    const insert = withTenant(marie, (tx) =>
      tx.insert(turns).values({
        tenantId: marie.tenantId,
        sourceId: ids.marieSource,
        externalId: randomUUID(),
        role: 'user',
        text: 'Tour glissé chez Paul.',
        ts: new Date(),
        captureMode: 'manual',
        acl: [paul.userId],
      }),
    );
    await expect(insert).rejects.toMatchObject({ cause: { code: '42501' } });
  });

  it("Marie n'insère pas de ligne dans le tenant de Zoé : 42501", async () => {
    const { marie, otherTenantId } = scenario;
    const insert = withTenant(marie, (tx) =>
      tx.insert(sources).values({
        tenantId: otherTenantId,
        kind: 'chatgpt',
        externalId: randomUUID(),
        ownerUserId: marie.userId,
        acl: [marie.userId],
      }),
    );
    await expect(insert).rejects.toMatchObject({ cause: { code: '42501' } });
  });

  it("l'app n'a pas le droit de supprimer : 42501", async () => {
    const remove = withTenant(scenario.paul, (tx) =>
      tx.delete(sources).where(eq(sources.id, scenario.ids.teamSource)),
    );
    await expect(remove).rejects.toMatchObject({ cause: { code: '42501' } });
  });
});

// Toute table du brut, y compris une table ajoutée plus tard à ce fichier de schéma.
describe('RLS et droits de leon_app sur le brut', () => {
  it.each(Object.values(memorySchema).map((table) => getTableConfig(table).name))(
    '%s : RLS active, ni delete ni truncate',
    async (name) => {
      const { rows } = await adminPool.query(
        `select relrowsecurity as rls,
                has_table_privilege('leon_app', $1, 'DELETE') as can_delete,
                has_table_privilege('leon_app', $1, 'TRUNCATE') as can_truncate
           from pg_class where relname = $1 and relkind = 'r'`,
        [name],
      );
      expect(rows).toEqual([{ rls: true, can_delete: false, can_truncate: false }]);
    },
  );
});
