import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { withTenant } from '@/server/db/with-tenant';
import { adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';

// Migration 0008 : types de sources des connecteurs, rôles de tours, connexions et fonction du tic.
// Fixtures par le propriétaire (hors RLS), tout le reste sous withTenant.

const PAST = '2000-01-01T00:00:00Z';
const tenantIds: string[] = [];

let paul: TenantContext;
let marie: TenantContext;
let zoe: TenantContext;

beforeAll(async () => {
  const team = await createTestTenant(['Paul', 'Marie']);
  const other = await createTestTenant(['Zoé']);
  [paul, marie] = team.members as [TenantContext, TenantContext];
  [zoe] = other.members as [TenantContext];
  tenantIds.push(team.tenantId, other.tenantId);
});

// Les connexions du tic sont partagées par tous les fichiers de test : on retire les nôtres, et seulement elles.
afterAll(async () => {
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});

type ConnectionInput = {
  provider?: string;
  status?: string;
  nextSyncAt?: string | null;
  lockedMinutesAgo?: number | null;
  secret?: string;
  secretHint?: string;
};

async function seedConnection(ctx: TenantContext, input: ConnectionInput = {}): Promise<string> {
  const id = randomUUID();
  await adminPool.query(
    `insert into connections (id, tenant_id, created_by, provider, label, secret, secret_hint,
                              status, since, next_sync_at, sync_lock_at, acl)
     values ($1, $2, $3, $4, 'Connexion de test', $5, $6, $7, now(), $8,
             case when $9::int is null then null else now() - make_interval(mins => $9::int) end,
             array[$2::uuid])`,
    [
      id,
      ctx.tenantId,
      ctx.userId,
      input.provider ?? 'github',
      input.secret ?? 'v1:aaaa:bbbb:cccc',
      input.secretHint ?? 'abcd',
      input.status ?? 'active',
      input.nextSyncAt === undefined ? null : input.nextSyncAt,
      input.lockedMinutesAgo ?? null,
    ],
  );
  return id;
}

async function insertSource(
  ctx: TenantContext,
  input: { kind: string; connectionId?: string },
): Promise<string> {
  const id = randomUUID();
  const acl = `{${ctx.tenantId}}`;
  await withTenant(ctx, (tx) =>
    input.connectionId === undefined
      ? tx.execute(sql`
          insert into sources (id, tenant_id, kind, external_id, owner_user_id, acl)
          values (${id}, ${ctx.tenantId}, ${input.kind}, ${randomUUID()}, ${ctx.userId}, ${acl}::uuid[])`)
      : tx.execute(sql`
          insert into sources (id, tenant_id, kind, external_id, owner_user_id, acl, connection_id)
          values (${id}, ${ctx.tenantId}, ${input.kind}, ${randomUUID()}, ${ctx.userId}, ${acl}::uuid[],
                  ${input.connectionId})`),
  );
  return id;
}

// Les identifiants de la connexion que `ctx` voit (la sécurité par ligne filtre).
async function visibleTo(ctx: TenantContext, id: string): Promise<string[]> {
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<{ id: string }>(sql`select id from connections where id = ${id}`),
  );
  return rows.map((row) => row.id);
}

async function dueConnectionIds(): Promise<Map<string, { tenant_id: string; user_id: string }>> {
  const { rows } = await db.execute<{ connection_id: string; tenant_id: string; user_id: string }>(
    sql`select connection_id, tenant_id, user_id from connector_syncs_due()`,
  );
  return new Map(rows.map((row) => [row.connection_id, row]));
}

describe('sources et tours des connecteurs', () => {
  it("accepte une source d'un outil", async () => {
    await expect(insertSource(paul, { kind: 'notion' })).resolves.toEqual(expect.any(String));
  });

  it('refuse un type de source inconnu', async () => {
    await expect(insertSource(paul, { kind: 'inconnu' })).rejects.toMatchObject({
      cause: { code: '23514' },
    });
  });

  it('accepte un tour de participant, capté par un connecteur, avec son auteur', async () => {
    const sourceId = await insertSource(paul, { kind: 'fathom' });

    const rows = await withTenant(paul, async (tx) => {
      await tx.execute(sql`
        insert into turns (tenant_id, source_id, external_id, role, text, ts, capture_mode, acl,
                           author_name, author_email)
        values (${paul.tenantId}, ${sourceId}, 'utterance:1', 'participant', 'Je m''en occupe.', now(),
                'connector', ${`{${paul.tenantId}}`}::uuid[], 'Marie', 'marie@acme.test')`);
      return tx.execute<{ role: string; author_name: string; author_email: string }>(
        sql`select role, author_name, author_email from turns where source_id = ${sourceId}`,
      );
    });

    expect(rows.rows).toEqual([
      { role: 'participant', author_name: 'Marie', author_email: 'marie@acme.test' },
    ]);
  });

  // Le côté vient d'un champ de l'outil, jamais d'un nom : nul tant que l'outil ne le dit pas.
  it("garde le côté de l'auteur et la note interne d'un tour, nuls et faux par défaut", async () => {
    const sourceId = await insertSource(paul, { kind: 'zendesk' });
    await withTenant(paul, (tx) =>
      tx.execute(sql`
        insert into turns (tenant_id, source_id, external_id, role, text, ts, capture_mode, acl)
        values (${paul.tenantId}, ${sourceId}, 'par-defaut', 'participant', 'Texte.', now(),
                'connector', ${`{${paul.tenantId}}`}::uuid[])`),
    );
    await withTenant(paul, (tx) =>
      tx.execute(sql`
        insert into turns (tenant_id, source_id, external_id, role, text, ts, capture_mode, acl,
                           author_side, internal_note)
        values (${paul.tenantId}, ${sourceId}, 'note', 'participant', 'Texte.', now(), 'connector',
                ${`{${paul.tenantId}}`}::uuid[], 'external', true)`),
    );

    const rows = await withTenant(paul, (tx) =>
      tx.execute<{ external_id: string; author_side: string | null; internal_note: boolean }>(
        sql`select external_id, author_side, internal_note from turns
            where source_id = ${sourceId} order by external_id`,
      ),
    );

    expect(rows.rows).toEqual([
      { external_id: 'note', author_side: 'external', internal_note: true },
      { external_id: 'par-defaut', author_side: null, internal_note: false },
    ]);
  });

  it("refuse un côté d'auteur inconnu", async () => {
    const sourceId = await insertSource(paul, { kind: 'zendesk' });

    await expect(
      withTenant(paul, (tx) =>
        tx.execute(sql`
          insert into turns (tenant_id, source_id, external_id, role, text, ts, capture_mode, acl,
                             author_side)
          values (${paul.tenantId}, ${sourceId}, 'x', 'participant', 'Texte.', now(), 'connector',
                  ${`{${paul.tenantId}}`}::uuid[], 'direction')`),
      ),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('accepte le rôle document et refuse un rôle inconnu', async () => {
    const sourceId = await insertSource(paul, { kind: 'notion' });
    const insertTurn = (role: string) =>
      withTenant(paul, (tx) =>
        tx.execute(sql`
          insert into turns (tenant_id, source_id, external_id, role, text, ts, capture_mode, acl)
          values (${paul.tenantId}, ${sourceId}, ${role}, ${role}, 'Texte.', now(), 'connector',
                  ${`{${paul.tenantId}}`}::uuid[])`),
      );

    await expect(insertTurn('document')).resolves.toBeDefined();
    await expect(insertTurn('robot')).rejects.toMatchObject({ cause: { code: '23514' } });
  });
});

describe('connections', () => {
  it("est visible d'un autre membre de l'équipe et invisible d'une autre organisation", async () => {
    const id = await seedConnection(paul);

    expect(await visibleTo(paul, id)).toEqual([id]);
    expect(await visibleTo(marie, id)).toEqual([id]);
    expect(await visibleTo(zoe, id)).toEqual([]);
  });

  // Le chemin de createConnection : l'application écrit sous withTenant, pas le propriétaire.
  it("s'insère sous withTenant, puis est visible d'un autre membre et invisible d'une autre organisation", async () => {
    const { rows } = await withTenant(paul, (tx) =>
      tx.execute<{ id: string }>(sql`
        insert into connections (tenant_id, created_by, provider, label, secret, secret_hint, since, acl)
        values (${paul.tenantId}, ${paul.userId}, 'github', 'Connexion créée par l''application',
                'v1:a:b:c', 'abcd', now(), ${`{${paul.tenantId}}`}::uuid[])
        returning id`),
    );
    const id = rows[0]?.id;
    if (!id) throw new Error('connexion non insérée');

    expect(await visibleTo(paul, id)).toEqual([id]);
    expect(await visibleTo(marie, id)).toEqual([id]);
    expect(await visibleTo(zoe, id)).toEqual([]);
  });

  it("refuse d'écrire une connexion dans une autre organisation", async () => {
    // Le message distingue la sécurité par ligne d'un droit d'insertion manquant : les deux rendent 42501.
    await expect(
      withTenant(zoe, (tx) =>
        tx.execute(sql`
          insert into connections (tenant_id, created_by, provider, label, secret, secret_hint, since, acl)
          values (${paul.tenantId}, ${paul.userId}, 'github', 'x', 'v1:a:b:c', 'abcd', now(),
                  ${`{${paul.tenantId}}`}::uuid[])`),
      ),
    ).rejects.toMatchObject({
      cause: { code: '42501', message: expect.stringMatching(/row-level security/) },
    });
  });

  it("refuse un secret qui n'est pas chiffré, un indice de plus de 4 caractères et un outil inconnu", async () => {
    await expect(seedConnection(paul, { secret: 'ghp_en_clair' })).rejects.toMatchObject({
      code: '23514',
    });
    await expect(seedConnection(paul, { secretHint: 'abcde' })).rejects.toMatchObject({
      code: '23514',
    });
    await expect(seedConnection(paul, { provider: 'slack' })).rejects.toMatchObject({
      code: '23514',
    });
  });

  it('met connection_id à null à la suppression, sans toucher tenant_id', async () => {
    const connectionId = await seedConnection(paul);
    const sourceId = await insertSource(paul, { kind: 'github', connectionId });

    await withTenant(paul, (tx) =>
      tx.execute(sql`delete from connections where id = ${connectionId}`),
    );

    const { rows } = await adminPool.query(
      'select tenant_id, connection_id from sources where id = $1',
      [sourceId],
    );
    expect(rows).toEqual([{ tenant_id: paul.tenantId, connection_id: null }]);
  });

  it("refuse qu'une source pointe vers la connexion d'une autre organisation", async () => {
    const connectionId = await seedConnection(paul);
    await expect(insertSource(zoe, { kind: 'github', connectionId })).rejects.toMatchObject({
      cause: { code: '23503' },
    });
  });
});

describe('connector_syncs_due()', () => {
  it('rend les connexions échues, et seulement elles', async () => {
    const active = await seedConnection(paul, { nextSyncAt: PAST });
    const inError = await seedConnection(paul, { status: 'error', nextSyncAt: PAST });
    const paused = await seedConnection(paul, { status: 'paused', nextSyncAt: PAST });
    const errorWithoutDeadline = await seedConnection(paul, { status: 'error', nextSyncAt: null });
    const future = await seedConnection(paul, { nextSyncAt: '2999-01-01T00:00:00Z' });
    const reservedRecently = await seedConnection(paul, { nextSyncAt: PAST, lockedMinutesAgo: 5 });
    const reservedLongAgo = await seedConnection(paul, { nextSyncAt: PAST, lockedMinutesAgo: 31 });

    const due = await dueConnectionIds();

    for (const id of [active, inError, reservedLongAgo]) expect(due.has(id), id).toBe(true);
    for (const id of [paused, errorWithoutDeadline, future, reservedRecently]) {
      expect(due.has(id), id).toBe(false);
    }
  });

  it("ne rend que trois identifiants : la connexion, l'organisation et le créateur", async () => {
    const id = await seedConnection(marie, { nextSyncAt: PAST });

    const due = await dueConnectionIds();

    expect(due.get(id)).toEqual({
      connection_id: id,
      tenant_id: marie.tenantId,
      user_id: marie.userId,
    });
  });
});
