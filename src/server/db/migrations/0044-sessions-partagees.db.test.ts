import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { depotsPrives } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { adminPool } from '@/test/db';
import { dropTeams, newTeam, seedIndexed } from '@/test/seed-indexed';
import { seedRun } from '@/test/seed-search';

// Migration 0044 : les sessions Claude Code liées à GitHub sont partagées à l'organisation ; depots_prives.

// L'indexation signale les projets au point du matin : pas de pg-boss ici.
vi.mock('@/server/briefing/queue');

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

const MIGRATION = readFileSync(new URL('./0044-sessions-partagees.sql', import.meta.url), 'utf8');
const BACKFILL = MIGRATION.split('-- début : partage des sessions passées')[1]?.split(
  '-- fin : partage des sessions passées',
)[0];

describe('0044 : partage des sessions passées', () => {
  it('partage les sessions claude_code liées à GitHub sur les cinq tables, et elles seules', async () => {
    expect(BACKFILL).toBeTruthy();
    const { tenantId, members } = await newTeam(['Paul'], tenantIds);
    const [paul] = members as [TenantContext];
    const github = await seedIndexed(paul, {
      kind: 'claude_code',
      metadata: { project: 'github.com/acme/app' },
    });
    const dossier = await seedRun(paul, {
      kind: 'claude_code',
      metadata: { project: 'dossier:0123456789abcdef' },
    });
    const sansCle = await seedRun(paul, { kind: 'claude_code' });
    const chat = await seedRun(paul, {
      kind: 'chatgpt',
      metadata: { project: 'github.com/acme/app' },
    });

    // Rejoué dans une transaction annulée : les sessions des autres fichiers de test ne bougent pas.
    const client = await adminPool.connect();
    try {
      await client.query('begin');
      await client.query(BACKFILL as string);
      const acls = async (query: string, sourceId: string) =>
        (await client.query<{ acl: string[] }>(query, [sourceId])).rows.map((row) => row.acl);

      for (const query of [
        'select distinct acl::text[] as acl from sources where id = $1',
        'select distinct acl::text[] as acl from turns where source_id = $1',
        'select distinct acl::text[] as acl from ingest_runs where source_id = $1',
        'select distinct acl::text[] as acl from passages where source_id = $1',
        `select distinct v.acl::text[] as acl from passage_vectors v
           join passages p on p.id = v.passage_id where p.source_id = $1`,
      ]) {
        expect(await acls(query, github.sourceId), query).toEqual([[tenantId]]);
      }
      for (const other of [dossier, sansCle, chat]) {
        expect(
          await acls(
            'select distinct acl::text[] as acl from sources where id = $1',
            other.sourceId,
          ),
        ).toEqual([[paul.userId]]);
      }
    } finally {
      await client.query('rollback');
      client.release();
    }
  });

  it('laisse privées les sessions d’un ancien membre, compte supprimé ou retiré de l’organisation', async () => {
    const { members } = await newTeam(['Paul', 'Marie'], tenantIds);
    const [paul, marie] = members as [TenantContext, TenantContext];
    const github = { kind: 'claude_code' as const, metadata: { project: 'github.com/acme/app' } };
    const supprime = await seedRun(paul, github);
    const retire = await seedRun(marie, github);

    const client = await adminPool.connect();
    try {
      await client.query('begin');
      await client.query('update "user" set deleted_at = now() where id = $1', [paul.userId]);
      await client.query('delete from member where "userId" = $1', [marie.userId]);
      await client.query(BACKFILL as string);
      const acl = async (sourceId: string) =>
        (
          await client.query<{ acl: string[] }>(
            'select acl::text[] as acl from sources where id = $1',
            [sourceId],
          )
        ).rows[0]?.acl;
      expect(await acl(supprime.sourceId)).toEqual([paul.userId]);
      expect(await acl(retire.sourceId)).toEqual([marie.userId]);
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
});

describe('0044 : depots_prives', () => {
  it('chacun ne voit que ses propres lignes, et ne les écrit que par regler_partage_depot', async () => {
    const { members } = await newTeam(['Paul', 'Marie'], tenantIds);
    const [paul, marie] = members as [TenantContext, TenantContext];

    await withTenant(paul, (tx) =>
      tx.execute(sql`select regler_partage_depot('github.com/acme/app', false)`),
    );

    const read = (ctx: TenantContext) =>
      withTenant(ctx, (tx) => tx.select({ project: depotsPrives.project }).from(depotsPrives));
    expect(await read(paul)).toEqual([{ project: 'github.com/acme/app' }]);
    expect(await read(marie)).toEqual([]);
    await expect(
      withTenant(marie, (tx) =>
        tx.insert(depotsPrives).values({
          tenantId: marie.tenantId,
          userId: marie.userId,
          project: 'github.com/acme/app',
        }),
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
  });

  it('refuse une clé qui n’est pas un dépôt GitHub', async () => {
    const { members } = await newTeam(['Paul'], tenantIds);
    const [paul] = members as [TenantContext];

    const { rows } = await withTenant(paul, (tx) =>
      tx.execute<{ n: number }>(
        sql`select regler_partage_depot('dossier:0123456789abcdef', false) as n`,
      ),
    );

    expect(rows[0]?.n).toBe(0);
    expect(await withTenant(paul, (tx) => tx.select().from(depotsPrives))).toEqual([]);
  });
});
