import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';
import { adminPool } from '@/test/db';
import { createTestTenant, seedSource, seedThread } from '@/test/fixtures';

// Migration 0066 : les leçons (C13 du plan de la mémoire à disposition, T55), privées à leur auteur quoi qu'écrive le
// code. versions_memoire et read_log gagnent la leçon comme cible, exactement une par ligne.

async function pair(): Promise<[TenantContext, TenantContext]> {
  const { members } = await createTestTenant(['Alice', 'Bob']);
  return members as [TenantContext, TenantContext];
}

// Une leçon posée par le propriétaire (hors RLS), comme l'écrirait lessons.ts. Rend son id.
const insertLesson = async (ctx: TenantContext, acl = [ctx.userId]) =>
  (
    await adminPool.query<{ id: string }>(
      `insert into lecons (tenant_id, owner_user_id, origine, acl)
       values ($1, $2, 'humain', $3::uuid[]) returning id`,
      [ctx.tenantId, ctx.userId, acl],
    )
  ).rows[0]?.id as string;

// Une version d'une leçon, d'une source, des deux ou d'aucune. Rend son id.
const insertVersion = async (
  ctx: TenantContext,
  cible: { leconId?: string; sourceId?: string },
  values: { n?: number; restaureDe?: string } = {},
) =>
  (
    await adminPool.query<{ id: string }>(
      `insert into versions_memoire
         (tenant_id, owner_user_id, lecon_id, source_id, n, texte, ecrit_par, motif, acl, restaure_de)
       values ($1, $2, $3, $4, $5, 'Relancer les tests.', 'humain', 'correction', array[$2::uuid], $6)
       returning id`,
      [
        ctx.tenantId,
        ctx.userId,
        cible.leconId ?? null,
        cible.sourceId ?? null,
        values.n ?? 1,
        values.restaureDe ?? null,
      ],
    )
  ).rows[0]?.id;

// Une lecture d'une leçon, d'une source, des deux ou d'aucune, puis annule : la ligne d'essai ne reste pas au journal.
async function insertRead(
  ctx: TenantContext,
  cible: { leconId?: string; sourceId?: string },
  tool = 'lessons',
): Promise<void> {
  const client = await adminPool.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into read_log (tenant_id, user_id, client, tool, lecon_id, source_id, acl)
       values ($1, $2, 'cli', $3, $4, $5, array[$2::uuid])`,
      [ctx.tenantId, ctx.userId, tool, cible.leconId ?? null, cible.sourceId ?? null],
    );
  } finally {
    await client.query('rollback');
    client.release();
  }
}

const CHECK_VIOLATION = { code: '23514' };
const UNIQUE_VIOLATION = { code: '23505' };
const FOREIGN_KEY_VIOLATION = { code: '23503' };

describe('lecons', () => {
  it("la leçon d'un collègue est introuvable", async () => {
    const [alice, bob] = await pair();
    const lesson = await insertLesson(alice);

    const read = (ctx: TenantContext) =>
      withTenant(ctx, (tx) => tx.execute(sql`select id from lecons where id = ${lesson}`));

    expect((await read(bob)).rows).toEqual([]);
    expect((await read(alice)).rows).toHaveLength(1);
  });

  it('une ACL élargie est refusée par la base', async () => {
    const [alice, bob] = await pair();

    await expect(insertLesson(alice, [alice.userId, alice.tenantId])).rejects.toMatchObject(
      CHECK_VIOLATION,
    );
    await expect(insertLesson(alice, [bob.userId])).rejects.toMatchObject(CHECK_VIOLATION);
  });

  it("l'app ne met à jour que l'acceptation, le retrait et la fréquence", async () => {
    const [alice] = await pair();
    const lesson = await insertLesson(alice);

    await expect(
      withTenant(alice, (tx) =>
        tx.execute(
          sql`update lecons set retiree_le = now(), acceptee_le = now(), frequence = 3 where id = ${lesson}`,
        ),
      ),
    ).resolves.toBeDefined();
    await expect(
      withTenant(alice, (tx) =>
        tx.execute(sql`update lecons set projet = 'github.com/acme/autre' where id = ${lesson}`),
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
  });
});

describe('versions_memoire, cible leçon', () => {
  it('une version a exactement une cible', async () => {
    const [alice] = await pair();
    const lesson = await insertLesson(alice);
    const thread = await seedThread(alice);

    await expect(insertVersion(alice, {})).rejects.toMatchObject(CHECK_VIOLATION);
    await expect(insertVersion(alice, { leconId: lesson, sourceId: thread })).rejects.toMatchObject(
      CHECK_VIOLATION,
    );
    await expect(insertVersion(alice, { leconId: lesson })).resolves.toBeDefined();
    await expect(insertVersion(alice, { sourceId: thread })).resolves.toBeDefined();
  });

  it("n est unique par leçon, et restaure_de ne mène qu'à une version de la même leçon", async () => {
    const [alice] = await pair();
    const lesson = await insertLesson(alice);
    const other = await insertLesson(alice);
    const origin = await insertVersion(alice, { leconId: lesson });

    await expect(insertVersion(alice, { leconId: lesson })).rejects.toMatchObject(UNIQUE_VIOLATION);
    await expect(
      insertVersion(alice, { leconId: other }, { restaureDe: origin }),
    ).rejects.toMatchObject(FOREIGN_KEY_VIOLATION);
    await expect(
      insertVersion(alice, { leconId: lesson }, { n: 2, restaureDe: origin }),
    ).resolves.toBeDefined();
  });

  it("une version ne pointe pas vers la leçon d'une autre organisation", async () => {
    const [alice] = await pair();
    const [carla] = (await createTestTenant(['Carla'])).members as [TenantContext];
    const theirs = await insertLesson(carla);

    await expect(insertVersion(alice, { leconId: theirs })).rejects.toMatchObject(
      FOREIGN_KEY_VIOLATION,
    );
  });

  it('supprimer la leçon emporte ses versions, restauration comprise', async () => {
    const [alice] = await pair();
    const lesson = await insertLesson(alice);
    const origin = await insertVersion(alice, { leconId: lesson });
    await insertVersion(alice, { leconId: lesson }, { n: 2, restaureDe: origin });

    await withTenant(alice, (tx) => tx.execute(sql`delete from lecons where id = ${lesson}`));

    const left = await adminPool.query('select id from versions_memoire where lecon_id = $1', [
      lesson,
    ]);
    expect(left.rows).toEqual([]);
  });
});

describe('read_log, cible leçon', () => {
  it('une ligne a exactement une cible', async () => {
    const [alice] = await pair();
    const lesson = await insertLesson(alice);
    const { sourceId } = await seedSource(alice);

    await expect(insertRead(alice, {})).rejects.toThrow(/read_log_cible_check/);
    await expect(insertRead(alice, { leconId: lesson, sourceId })).rejects.toThrow(
      /read_log_cible_check/,
    );
    await expect(insertRead(alice, { leconId: lesson })).resolves.toBeUndefined();
    await expect(insertRead(alice, { sourceId }, 'thread')).resolves.toBeUndefined();
  });

  it('accepte lessons, refuse lecons', async () => {
    const [alice] = await pair();
    const lesson = await insertLesson(alice);

    await expect(insertRead(alice, { leconId: lesson }, 'lessons')).resolves.toBeUndefined();
    await expect(insertRead(alice, { leconId: lesson }, 'lecons')).rejects.toThrow(
      /read_log_tool_check/,
    );
  });
});

// sources_lues_pendant (0064, recréée) : une lecture de leçon pendant une session n'est pas une source lue. Sans le
// filtre, son source_id nul entrerait dans les entrées de l'état du fil, et le rendrait illisible (D33).
describe('sources_lues_pendant', () => {
  it('une lecture de leçon ne met aucun NULL dans les sources lues', async () => {
    const [alice] = await pair();
    const { sourceId: session } = await seedSource(alice);
    const lesson = await insertLesson(alice);
    const { sourceId: lue } = await seedSource(alice, { kind: 'slack' });
    for (const cible of [`lecon_id`, `source_id`]) {
      await adminPool.query(
        `insert into read_log (tenant_id, user_id, client, tool, ${cible}, acl)
         values ($1, $2, 'cli', $3, $4, array[$2::uuid])`,
        [
          alice.tenantId,
          alice.userId,
          cible === 'lecon_id' ? 'lessons' : 'search',
          cible === 'lecon_id' ? lesson : lue,
        ],
      );
    }

    const { rows } = await withTenant(alice, (tx) =>
      tx.execute<{ id: string | null }>(
        sql`select sources_lues_pendant(${`{${session}}`}::uuid[]) as id`,
      ),
    );

    expect(rows).toEqual([{ id: lue }]);
  });
});
