import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { briefings } from '@/server/db/schema/search';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';

// Migration 0013 : les points du matin, privés à leur utilisateur, et les deux fonctions qui les parcourent hors
// sécurité par ligne (des identifiants seulement). Fixtures par le propriétaire de la base ; lectures et écritures
// de l'app sous withTenant, ou sans contexte d'organisation pour les fonctions (comme les tics).

const PROJECT = 'github.com/acme/leon';
const DAY = 86_400_000;

const tenantIds: string[] = [];
let alice: TenantContext;
let bob: TenantContext;
let zoe: TenantContext;

beforeAll(async () => {
  const team = await createTestTenant(['Alice', 'Bob']);
  const other = await createTestTenant(['Zoé']);
  [alice, bob] = team.members as [TenantContext, TenantContext];
  [zoe] = other.members as [TenantContext];
  tenantIds.push(team.tenantId, other.tenantId);
});

afterAll(async () => {
  await adminPool.query('delete from briefings where tenant_id = any($1)', [tenantIds]);
});

async function seedBriefing(
  owner: TenantContext,
  input: { project?: string; lastReadAt?: Date | null } = {},
): Promise<string> {
  const [row] = await adminDb
    .insert(briefings)
    .values({
      tenantId: owner.tenantId,
      userId: owner.userId,
      project: input.project ?? PROJECT,
      markdown: '# Point du matin',
      preparedAt: new Date(),
      lastReadAt: input.lastReadAt ?? null,
      acl: [owner.userId],
    })
    .returning({ id: briefings.id });
  if (!row) throw new Error('point de test non créé');
  return row.id;
}

const uniqueProject = () => `github.com/acme/projet-${crypto.randomUUID().slice(0, 8)}`;

describe('briefings sous la sécurité par ligne', () => {
  it('un point n’est lu que par son utilisateur', async () => {
    const project = uniqueProject();
    await seedBriefing(alice, { project });

    const asAlice = await withTenant(alice, (tx) =>
      tx.select().from(briefings).where(eq(briefings.project, project)),
    );
    const asBob = await withTenant(bob, (tx) =>
      tx.select().from(briefings).where(eq(briefings.project, project)),
    );

    expect(asAlice.map((row) => row.userId)).toEqual([alice.userId]);
    expect(asBob).toEqual([]);
  });

  it('l’utilisateur écrit son propre point, jamais celui d’un autre, et jamais visible de l’équipe', async () => {
    const values = (acl: string[], userId = alice.userId) => ({
      tenantId: alice.tenantId,
      userId,
      project: uniqueProject(),
      markdown: 'Point',
      preparedAt: new Date(),
      acl,
    });

    await expect(
      withTenant(alice, (tx) => tx.insert(briefings).values(values([alice.userId]))),
    ).resolves.toBeDefined();
    // Visible de l'équipe : refusé par la base, quoi qu'écrive le code.
    await expect(
      withTenant(alice, (tx) => tx.insert(briefings).values(values([alice.tenantId]))),
    ).rejects.toThrow();
    // Au nom de Bob : refusé (Bob n'est pas parmi les principaux d'Alice).
    await expect(
      withTenant(alice, (tx) => tx.insert(briefings).values(values([bob.userId], bob.userId))),
    ).rejects.toThrow();
  });

  it('refuse une clé de projet qui n’a pas la forme d’un dépôt ou d’un dossier', async () => {
    for (const project of [
      'evil',
      'github.com/Acme/Leon',
      'dossier:123',
      `github.com/a/${'b'.repeat(200)}`,
    ]) {
      await expect(
        adminPool.query(
          `insert into briefings (tenant_id, user_id, project, markdown, prepared_at, acl)
           values ($1, $2, $3, 'Point', now(), array[$2::uuid])`,
          [alice.tenantId, alice.userId, project],
        ),
        project,
      ).rejects.toThrow();
    }
  });

  it('leon_app lit, ajoute et refait un point, sans le supprimer ni changer son projet ou son utilisateur', async () => {
    const privilege = async (column: string | null, kind: string) => {
      const { rows } = await adminPool.query<{ granted: boolean }>(
        column === null
          ? `select has_table_privilege('leon_app', 'public.briefings', $1) as granted`
          : `select has_column_privilege('leon_app', 'public.briefings', $2, $1) as granted`,
        column === null ? [kind] : [kind, column],
      );
      return rows[0]?.granted;
    };

    expect(await privilege(null, 'SELECT')).toBe(true);
    expect(await privilege(null, 'INSERT')).toBe(true);
    expect(await privilege(null, 'DELETE')).toBe(false);
    for (const column of ['markdown', 'source_ids', 'prepared_at', 'last_read_at', 'stale']) {
      expect(await privilege(column, 'UPDATE'), column).toBe(true);
    }
    for (const column of ['tenant_id', 'user_id', 'project', 'acl']) {
      expect(await privilege(column, 'UPDATE'), column).toBe(false);
    }
  });
});

type UserRow = { user_id: string };
type DueRow = { tenant_id: string; user_id: string; project: string };

describe('briefings_du_projet', () => {
  it('rend les utilisateurs de l’organisation courante qui ont un point sur ce projet, et eux seuls', async () => {
    const project = uniqueProject();
    await seedBriefing(alice, { project });
    await seedBriefing(bob, { project });
    await seedBriefing(zoe, { project });
    await seedBriefing(bob, { project: uniqueProject() });

    const { rows } = await withTenant(alice, (tx) =>
      tx.execute<UserRow>(sql`select user_id from briefings_du_projet(${project})`),
    );

    expect(rows.map((row) => row.user_id).sort()).toEqual([alice.userId, bob.userId].sort());
  });

  it('ne rend rien sans organisation courante', async () => {
    const project = uniqueProject();
    await seedBriefing(alice, { project });

    const { rows } = await db.execute<UserRow>(
      sql`select user_id from briefings_du_projet(${project})`,
    );

    expect(rows).toEqual([]);
  });
});

describe('briefings_a_rafraichir', () => {
  it('rend les points lus depuis moins de p_days jours, toutes organisations, et eux seuls', async () => {
    const recent = uniqueProject();
    const old = uniqueProject();
    const never = uniqueProject();
    await seedBriefing(alice, { project: recent, lastReadAt: new Date(Date.now() - 2 * DAY) });
    await seedBriefing(zoe, { project: recent, lastReadAt: new Date(Date.now() - DAY) });
    await seedBriefing(bob, { project: old, lastReadAt: new Date(Date.now() - 8 * DAY) });
    await seedBriefing(alice, { project: never, lastReadAt: null });

    const { rows } = await db.execute<DueRow>(
      sql`select tenant_id, user_id, project from briefings_a_rafraichir(7)`,
    );
    const mine = rows.filter((row) => [recent, old, never].includes(row.project));

    expect(mine).toEqual(
      expect.arrayContaining([
        { tenant_id: alice.tenantId, user_id: alice.userId, project: recent },
        { tenant_id: zoe.tenantId, user_id: zoe.userId, project: recent },
      ]),
    );
    expect(mine).toHaveLength(2);
  });
});

describe('droits sur les fonctions des points du matin', () => {
  const FUNCTIONS = [
    ['briefings_du_projet(text)', 'TABLE(user_id uuid)'],
    ['briefings_a_rafraichir(integer)', 'TABLE(tenant_id uuid, user_id uuid, project text)'],
  ] as const;

  it.each(FUNCTIONS)('%s ne rend que des identifiants', async (signature, result) => {
    const { rows } = await adminPool.query<{ result: string }>(
      'select pg_get_function_result($1::regprocedure) as result',
      [signature],
    );

    expect(rows).toEqual([{ result }]);
  });

  it.each(FUNCTIONS)(
    '%s ne s’exécute pas pour public, seulement pour leon_app',
    async (signature) => {
      const { rows } = await adminPool.query<{ public_grants: number; app: boolean }>(
        `select (select count(*)::int
                 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.oid = $1::regprocedure and a.grantee = 0
                  and a.privilege_type = 'EXECUTE') as public_grants,
              has_function_privilege('leon_app', $1::regprocedure, 'EXECUTE') as app`,
        [signature],
      );

      expect(rows).toEqual([{ public_grants: 0, app: true }]);
    },
  );

  it.each(FUNCTIONS)(
    '%s s’exécute avec les droits du propriétaire, sur le schéma public seulement',
    async (signature) => {
      const { rows } = await adminPool.query<{ prosecdef: boolean; proconfig: string[] }>(
        'select prosecdef, proconfig from pg_proc where oid = $1::regprocedure',
        [signature],
      );

      expect(rows).toEqual([{ prosecdef: true, proconfig: ['search_path=public'] }]);
    },
  );
});
