import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { PipedreamConfig } from '@/server/connectors/pipedream';
import { members, organizations, users } from '@/server/db/schema/auth';
import { connections } from '@/server/db/schema/connections';
import { sources, turns } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb, adminPool } from '@/test/db';
import {
  createTestTenant,
  createTestUser,
  seedConnection,
  seedSource,
  seedThread,
} from '@/test/fixtures';
import { createApiToken, verifyApiToken } from './api-tokens';
import { auth } from './auth';
import {
  DeletionRefused,
  deleteAccount,
  deleteOrganization,
  deletionInfo,
  formerEmail,
} from './delete-account';
import { principalsFor, type TenantContext } from './tenant-context';

// La proposition « About you » de Bob survit à la suppression d'Alice : l'organisation de test reste, sa ligne ne doit pas.
const suggestionTenants: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from about_suggestions where tenant_id = any($1)', [
    suggestionTenants,
  ]);
});

const setRole = (ctx: TenantContext, role: string) =>
  adminDb
    .update(members)
    .set({ role })
    .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)));

const markFormer = (ctx: TenantContext) =>
  adminDb.update(users).set({ deletedAt: new Date() }).where(eq(users.id, ctx.userId));

// Une organisation dont les membres, du plus ancien au plus récent, portent ces rôles.
async function team(roles: string[]) {
  const { tenantId, members: people } = await createTestTenant(
    roles.map((_, index) => `Membre ${index + 1}`),
  );
  for (const [index, ctx] of people.entries()) {
    await setRole(ctx, roles[index] ?? 'member');
    await adminDb
      .update(members)
      .set({ createdAt: new Date(Date.UTC(2026, 0, index + 1)) })
      .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, tenantId)));
  }
  return { tenantId, people };
}

const userRow = async (userId: string) =>
  (await adminDb.select().from(users).where(eq(users.id, userId)))[0];

const emailOf = async (ctx: TenantContext) => {
  const row = await userRow(ctx.userId);
  if (!row) throw new Error('utilisateur de test introuvable');
  return row.email;
};

const roleOf = async (ctx: TenantContext) =>
  (
    await adminDb
      .select({ role: members.role })
      .from(members)
      .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)))
  )[0]?.role;

// De quoi se connecter, se faire reconnaître ou relever des outils, à effacer.
async function seedLogin(ctx: TenantContext) {
  const { tenantId, userId } = ctx;
  await adminPool.query(
    `insert into account ("accountId", "providerId", "userId", password, "updatedAt")
     values ($2, 'credential', $1, 'empreinte', now())`,
    [userId, userId],
  );
  await adminPool.query(
    `insert into session ("expiresAt", token, "updatedAt", "userId")
     values (now() + interval '1 day', $1, now(), $2)`,
    [randomUUID(), userId],
  );
  await adminPool.query(
    `insert into "twoFactor" (secret, "backupCodes", "userId") values ('secret', 'codes', $1)`,
    [userId],
  );
  await adminPool.query(
    `insert into api_tokens (tenant_id, user_id, name, token_hash, token_hint)
     values ($1, $2, 'cli', $3, 'abcd')`,
    [tenantId, userId, randomUUID()],
  );
  await adminPool.query(
    `insert into invitation_links (tenant_id, created_by, token_hash, expires_at)
     values ($1, $2, $3, now() + interval '7 days')`,
    [tenantId, userId, randomUUID()],
  );
  await adminPool.query(
    `insert into verification (identifier, value, "expiresAt")
     values ($1, $2, now() + interval '1 hour')`,
    [`reset-password:${randomUUID()}`, userId],
  );
  await adminDb
    .update(users)
    .set({
      emailVerified: true,
      image: 'https://example.com/moi.png',
      about: 'Responsable produit.',
      twoFactorEnabled: true,
    })
    .where(eq(users.id, userId));
  return seedConnection(ctx);
}

async function loginTraces(userId: string) {
  const { rows } = await adminPool.query<Record<string, number>>(
    `select
       (select count(*)::int from account where "userId" = $1) as accounts,
       (select count(*)::int from session where "userId" = $1) as sessions,
       (select count(*)::int from "twoFactor" where "userId" = $1) as two_factor,
       (select count(*)::int from verification where value = $1::text) as resets,
       (select count(*)::int from connections where created_by = $1) as connections,
       (select count(*)::int from api_tokens where user_id = $1 and revoked_at is null) as tokens,
       (select count(*)::int from invitation_links
         where created_by = $1 and used_at is null and expires_at > now()) as links`,
    [userId],
  );
  return rows[0];
}

// La source et ses tours passent de privés à partagés avec toute l'équipe.
async function shareWithTeam(ctx: TenantContext, sourceId: string) {
  await adminDb
    .update(sources)
    .set({ acl: [ctx.tenantId] })
    .where(eq(sources.id, sourceId));
  await adminDb
    .update(turns)
    .set({ acl: [ctx.tenantId] })
    .where(eq(turns.sourceId, sourceId));
}

const visibleSourceIds = (ctx: TenantContext) =>
  withTenant(ctx, async (tx) =>
    (await tx.select({ id: sources.id }).from(sources)).map((s) => s.id),
  );

const activeOwners = async (tenantId: string) =>
  adminDb
    .select({ userId: members.userId })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(
      and(eq(members.organizationId, tenantId), eq(members.role, 'owner'), isNull(users.deletedAt)),
    );

describe('deleteAccount', () => {
  it('garde ses sources, ses tours et ses discussions, et efface ce qui le rend joignable', async () => {
    const { tenantId, members: people } = await createTestTenant(['Alice Martin', 'Bob Durand']);
    const [alice, bob] = people as [TenantContext, TenantContext];
    await setRole(alice, 'admin');
    await setRole(bob, 'owner');
    const connectionId = await seedLogin(alice);
    await adminDb
      .update(connections)
      .set({
        config: {
          authMode: 'pipedream',
          externalUserId: 'leon-alice',
          accountId: 'apn_1',
        } satisfies PipedreamConfig,
      })
      .where(eq(connections.id, connectionId));
    const bobConnectionId = await seedConnection(bob);
    const privateSource = await seedSource(alice, { title: 'Privée' });
    const sharedSource = await seedSource(alice, { title: 'Partagée' });
    // Ses fils de travail sont tirés de sa mémoire et privés : ils partent avec elle (D21), pas ceux de Bob.
    const aliceThread = await seedThread(alice);
    const bobThread = await seedThread(bob);
    await shareWithTeam(alice, sharedSource.sourceId);
    await adminDb
      .update(sources)
      .set({ connectionId })
      .where(eq(sources.id, sharedSource.sourceId));
    await adminPool.query(
      `insert into discussions (tenant_id, user_id, title, acl) values ($1, $2, 'Ma discussion', array[$2::uuid])`,
      [tenantId, alice.userId],
    );
    await adminPool.query(
      `insert into briefings (tenant_id, user_id, project, markdown, prepared_at, acl)
       values ($1, $2, 'github.com/acme/depot', '# Point', now(), array[$2::uuid])`,
      [tenantId, alice.userId],
    );
    // La proposition « About you » est faite des sources d'Alice : elle part avec elle, pas celle de Bob.
    suggestionTenants.push(tenantId);
    await adminPool.query(
      `insert into about_suggestions (tenant_id, user_id, text, acl)
       values ($1, $2, 'Responsable produit.', array[$2::uuid]), ($1, $3, 'Lead back-end.', array[$3::uuid])`,
      [tenantId, alice.userId, bob.userId],
    );
    // Ses versions partent avec elle, celles de ses fils comme celles d'une source qu'elle laisse (une note) ; pas
    // celles de Bob (C12).
    await adminPool.query(
      `insert into versions_memoire (tenant_id, owner_user_id, source_id, n, texte, ecrit_par, motif, acl)
       values ($1, $2, $3, 1, 'Fil.', 'serveur', 'rangement', array[$2::uuid]),
              ($1, $2, $4, 1, 'Note.', 'agent', 'note', array[$2::uuid]),
              ($1, $5, $6, 1, 'Fil de Bob.', 'serveur', 'rangement', array[$5::uuid])`,
      [tenantId, alice.userId, aliceThread, privateSource.sourceId, bob.userId, bobThread],
    );
    const email = await emailOf(alice);
    expect(await loginTraces(alice.userId)).toEqual({
      accounts: 1,
      sessions: 1,
      two_factor: 1,
      resets: 1,
      connections: 1,
      tokens: 1,
      links: 1,
    });

    const result = await deleteAccount(alice, null, false);

    expect(result).toEqual({
      organizationDeleted: false,
      organizationName: 'Organisation de test',
      notify: [{ email, kind: 'account' }],
      pipedreamUsers: ['leon-alice'],
    });
    expect(await userRow(alice.userId)).toMatchObject({
      name: 'Alice Martin',
      email: formerEmail(alice.userId),
      emailVerified: false,
      image: null,
      about: null,
      twoFactorEnabled: false,
      deletedAt: expect.any(Date),
    });
    expect(await loginTraces(alice.userId)).toEqual({
      accounts: 0,
      sessions: 0,
      two_factor: 0,
      resets: 0,
      connections: 0,
      tokens: 0,
      links: 0,
    });
    const { rows: tokens } = await adminPool.query(
      'select revoked_at from api_tokens where user_id = $1',
      [alice.userId],
    );
    expect(tokens).toEqual([{ revoked_at: expect.any(Date) }]);
    expect(await roleOf(alice)).toBe('member');
    expect(await roleOf(bob)).toBe('owner');

    // Ses sources restent, la connexion qui les a apportées non ; ce que Bob a branché reste.
    const stillThere = await adminDb
      .select({ id: sources.id, connectionId: sources.connectionId })
      .from(sources)
      .where(eq(sources.ownerUserId, alice.userId));
    expect(stillThere.toSorted((a, b) => a.id.localeCompare(b.id))).toEqual(
      [
        { id: privateSource.sourceId, connectionId: null },
        { id: sharedSource.sourceId, connectionId: null },
      ].toSorted((a, b) => a.id.localeCompare(b.id)),
    );
    expect(
      await adminDb
        .select({ id: sources.id })
        .from(sources)
        .where(inArray(sources.id, [aliceThread, bobThread])),
    ).toEqual([{ id: bobThread }]);
    const turnCount = await adminDb
      .select({ id: turns.id })
      .from(turns)
      .where(eq(turns.sourceId, privateSource.sourceId));
    expect(turnCount).toHaveLength(1);
    const { rows: kept } = await adminPool.query(
      `select (select count(*)::int from discussions where user_id = $1) as discussions,
              (select count(*)::int from briefings where user_id = $1) as briefings`,
      [alice.userId],
    );
    expect(kept).toEqual([{ discussions: 1, briefings: 1 }]);
    const { rows: suggestions } = await adminPool.query(
      'select user_id from about_suggestions where tenant_id = $1',
      [tenantId],
    );
    expect(suggestions).toEqual([{ user_id: bob.userId }]);
    const { rows: versions } = await adminPool.query(
      'select owner_user_id from versions_memoire where tenant_id = $1',
      [tenantId],
    );
    expect(versions).toEqual([{ owner_user_id: bob.userId }]);
    expect(
      (await adminDb.select().from(connections).where(eq(connections.id, bobConnectionId))).length,
    ).toBe(1);

    // La même visibilité qu'avant : la source partagée l'est toujours, la privée n'est plus lue de personne.
    const seen = await visibleSourceIds(bob);
    expect(seen).toContain(sharedSource.sourceId);
    expect(seen).not.toContain(privateSource.sourceId);
  });

  it("ne laisse plus se connecter ni servir un jeton d'API, et libère son adresse", async () => {
    const email = `paul-${randomUUID()}@example.com`;
    const password = 'motdepasse-solide';
    const { tenantId } = await team(['member']);
    const { user } = await auth.api.signUpEmail({ body: { name: 'Paul Martin', email, password } });
    await adminDb
      .insert(members)
      .values({ organizationId: tenantId, userId: user.id, role: 'member', createdAt: new Date() });
    const paul = { tenantId, userId: user.id, principals: principalsFor(user.id, tenantId) };
    await expect(auth.api.signInEmail({ body: { email, password } })).resolves.toBeDefined();
    const { token } = await createApiToken(paul, 'cli');
    expect(await verifyApiToken(token)).not.toBeNull();
    // Un vrai lien de réinitialisation demandé avant : Better Auth le range dans `verification`, avec l'id pour valeur.
    await auth.api.requestPasswordReset({ body: { email }, headers: new Headers() });
    expect((await loginTraces(user.id))?.resets).toBe(1);

    await deleteAccount(paul, null, false);

    expect(await verifyApiToken(token)).toBeNull();
    expect((await loginTraces(user.id))?.resets).toBe(0);

    await expect(auth.api.signInEmail({ body: { email, password } })).rejects.toThrow();
    await expect(
      auth.api.signInEmail({ body: { email: formerEmail(user.id), password } }),
    ).rejects.toThrow();
    const holders = await adminDb
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    expect(holders).toEqual([]);
    // Demander un lien avec l'ancienne adresse ne mène à aucun compte : rien n'est préparé.
    await auth.api.requestPasswordReset({ body: { email }, headers: new Headers() });
    expect((await loginTraces(user.id))?.resets).toBe(0);
    // L'adresse redevient libre : la personne peut se réinscrire, comme quelqu'un de nouveau.
    await expect(
      auth.api.signUpEmail({ body: { name: 'Paul Martin', email, password } }),
    ).resolves.toBeDefined();
  });

  it('demande un successeur au seul propriétaire', async () => {
    const { tenantId, people } = await team(['owner', 'member', 'member']);
    const [owner, member, former] = people as [TenantContext, TenantContext, TenantContext];
    await markFormer(former);
    const outsider = (await team(['member'])).people[0] as TenantContext;
    const refused = (successorId: string | null) =>
      expect(deleteAccount(owner, successorId, false)).rejects.toMatchObject({
        reason: 'successeur',
      });

    await refused(null);
    await refused(outsider.userId);
    await refused(former.userId);
    await refused(owner.userId);
    await refused(randomUUID());
    expect((await userRow(owner.userId))?.deletedAt).toBeNull();
    expect(await roleOf(owner)).toBe('owner');

    await deleteAccount(owner, member.userId, false);

    expect(await roleOf(member)).toBe('owner');
    expect(await roleOf(owner)).toBe('member');
    expect((await userRow(owner.userId))?.deletedAt).toBeInstanceOf(Date);
    expect((await activeOwners(tenantId)).map((row) => row.userId)).toEqual([member.userId]);
  });

  it("ne demande pas de successeur à qui n'est pas le seul propriétaire", async () => {
    const { people } = await team(['owner', 'owner', 'member']);
    const [first, second] = people as [TenantContext, TenantContext, TenantContext];

    await deleteAccount(first, null, false);

    expect(await roleOf(first)).toBe('member');
    expect(await roleOf(second)).toBe('owner');
  });

  it("supprime l'organisation quand il est le seul membre actif", async () => {
    const { tenantId, people } = await team(['owner', 'member']);
    const [owner, former] = people as [TenantContext, TenantContext];
    await markFormer(former);
    const connectionId = await seedConnection(owner);
    await adminDb
      .update(connections)
      .set({
        config: {
          authMode: 'pipedream',
          externalUserId: 'leon-seul',
          accountId: 'apn_2',
        } satisfies PipedreamConfig,
      })
      .where(eq(connections.id, connectionId));
    const mine = await seedSource(owner);
    const others = await team(['owner']);
    const [otherOwner] = others.people as [TenantContext];
    const theirs = await seedSource(otherOwner);
    const email = await emailOf(owner);

    const result = await deleteAccount(owner, null, true);

    expect(result).toEqual({
      organizationDeleted: true,
      organizationName: 'Organisation de test',
      notify: [{ email, kind: 'account' }],
      pipedreamUsers: ['leon-seul'],
    });
    expect(
      await adminDb.select().from(organizations).where(eq(organizations.id, tenantId)),
    ).toEqual([]);
    expect(await adminDb.select().from(sources).where(eq(sources.id, mine.sourceId))).toEqual([]);
    expect(
      await adminDb.select().from(connections).where(eq(connections.id, connectionId)),
    ).toEqual([]);
    expect(await userRow(owner.userId)).toBeUndefined();
    expect(await userRow(former.userId)).toBeUndefined();
    expect(
      await adminDb.select().from(sources).where(eq(sources.id, theirs.sourceId)),
    ).toHaveLength(1);
    expect(await userRow(otherOwner.userId)).toBeDefined();
  });

  it("refuse quand il est membre d'une autre organisation", async () => {
    const { people } = await team(['member', 'member']);
    const [member] = people as [TenantContext, TenantContext];
    const other = await team(['member']);
    const [elsewhere] = other.people as [TenantContext];
    await adminDb.insert(members).values({
      organizationId: elsewhere.tenantId,
      userId: member.userId,
      role: 'member',
      createdAt: new Date(),
    });
    await seedLogin(member);

    await expect(deleteAccount(member, null, false)).rejects.toMatchObject({
      reason: 'autre_organisation',
    });

    expect((await userRow(member.userId))?.deletedAt).toBeNull();
    expect((await loginTraces(member.userId))?.accounts).toBe(1);
  });

  it("refuse un compte qui n'est pas membre actif de l'organisation", async () => {
    const { tenantId } = await team(['owner']);
    const { people } = await team(['member']);
    const [stranger] = people as [TenantContext];
    await adminDb.delete(members).where(eq(members.userId, stranger.userId));

    await expect(
      deleteAccount(
        { tenantId, userId: stranger.userId, principals: principalsFor(stranger.userId, tenantId) },
        null,
        false,
      ),
    ).rejects.toThrow();

    expect((await userRow(stranger.userId))?.deletedAt).toBeNull();
  });

  it("ne laisse jamais l'organisation sans propriétaire", async () => {
    const { tenantId, people } = await team(['owner', 'owner', 'member']);
    const [a, b] = people as [TenantContext, TenantContext, TenantContext];

    const outcomes = await Promise.allSettled([
      deleteAccount(a, b.userId, false),
      deleteAccount(b, a.userId, false),
    ]);

    expect(await activeOwners(tenantId)).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const [refusal] = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(refusal?.reason).toBeInstanceOf(DeletionRefused);
  });
});

describe('deleteAccount : ce que le dialogue a montré', () => {
  // B ouvre le dialogue quand A est encore là (B n'est pas seul) ; A part en nommant B ; B confirme sur ce
  // qu'il a vu : il ne doit pas effacer l'organisation sans l'avoir lue.
  it("refuse de supprimer l'organisation sur un dialogue ouvert avant le départ des autres", async () => {
    const { tenantId, people } = await team(['owner', 'member']);
    const [a, b] = people as [TenantContext, TenantContext];
    const source = await seedSource(a);
    expect((await deletionInfo(b)).soleActiveMember).toBe(false);
    await deleteAccount(a, b.userId, false);
    expect((await deletionInfo(b)).soleActiveMember).toBe(true);

    await expect(deleteAccount(b, null, false)).rejects.toMatchObject({ reason: 'situation' });

    expect(
      await adminDb.select().from(organizations).where(eq(organizations.id, tenantId)),
    ).toHaveLength(1);
    expect(
      await adminDb.select().from(sources).where(eq(sources.id, source.sourceId)),
    ).toHaveLength(1);
    expect((await userRow(b.userId))?.deletedAt).toBeNull();
  });

  it("refuse aussi de partir seul quand le dialogue annonçait l'organisation supprimée", async () => {
    const { tenantId, people } = await team(['owner', 'member']);
    const [owner] = people as [TenantContext, TenantContext];

    await expect(deleteAccount(owner, null, true)).rejects.toMatchObject({ reason: 'situation' });

    expect(
      await adminDb.select().from(organizations).where(eq(organizations.id, tenantId)),
    ).toHaveLength(1);
    expect((await userRow(owner.userId))?.deletedAt).toBeNull();
  });

  // Une invitation acceptée au même instant : la suppression attend qu'elle soit validée, puis relit l'équipe.
  it("attend l'adhésion en cours d'une invitation avant de lire l'organisation", async () => {
    const { tenantId, people } = await team(['owner', 'member']);
    const [owner, member] = people as [TenantContext, TenantContext];
    const newcomer = ((await team(['member'])).people as [TenantContext])[0];
    const joining = await adminPool.connect();
    try {
      await joining.query('begin');
      await joining.query(
        `insert into member ("organizationId", "userId", role, "createdAt") values ($1, $2, 'member', now())`,
        [tenantId, newcomer.userId],
      );
      let settled = false;
      const leaving = deleteAccount(owner, member.userId, false).finally(() => {
        settled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(settled).toBe(false);

      await joining.query('commit');
      await leaving;
    } finally {
      await joining.query('rollback'); // sans effet une fois validée ; libère les verrous si un test échoue
      joining.release();
    }

    expect((await deletionInfo(member)).activeMembers).toBe(2);
  });

  // `joinWithInvitation` sert le lien, puis ajoute le membre (la clé étrangère verrouille l'organisation) : la
  // suppression prend ses verrous dans le même ordre, sans quoi elle tient l'organisation en attendant le lien
  // que l'inscription tient en attendant l'organisation (interblocage, une des deux échoue).
  it('ne se bloque pas avec une inscription par le lien du partant', async () => {
    const { tenantId, people } = await team(['owner', 'member']);
    const [owner, member] = people as [TenantContext, TenantContext];
    const newcomer = ((await team(['member'])).people as [TenantContext])[0];
    const { rows } = await adminPool.query<{ id: string }>(
      `insert into invitation_links (tenant_id, created_by, token_hash, expires_at)
       values ($1, $2, $3, now() + interval '7 days') returning id`,
      [tenantId, owner.userId, randomUUID()],
    );
    const joining = await adminPool.connect();
    try {
      await joining.query('begin');
      await joining.query('update invitation_links set used_at = now() where id = $1', [
        rows[0]?.id,
      ]);
      const leaving = deleteAccount(owner, member.userId, false);
      await new Promise((resolve) => setTimeout(resolve, 300));
      // Avec l'ancien ordre, cet ajout attend l'organisation que la suppression tient, qui attend ce lien.
      await joining.query(
        `insert into member ("organizationId", "userId", role, "createdAt") values ($1, $2, 'member', now())`,
        [tenantId, newcomer.userId],
      );
      await joining.query('commit');

      await expect(leaving).resolves.toMatchObject({ organizationDeleted: false });
    } finally {
      await joining.query('rollback');
      joining.release();
    }

    expect((await deletionInfo(member)).activeMembers).toBe(2);
  });
});

describe('deletionInfo', () => {
  it('dit si un successeur est nécessaire, et qui peut le devenir, par ancienneté', async () => {
    const { people } = await team(['owner', 'admin', 'member', 'member']);
    const [owner, admin, member, former] = people as [
      TenantContext,
      TenantContext,
      TenantContext,
      TenantContext,
    ];
    await markFormer(former);

    expect(await deletionInfo(owner)).toEqual({
      organizationName: 'Organisation de test',
      isOwner: true,
      soleActiveMember: false,
      needsSuccessor: true,
      successors: [
        { userId: admin.userId, name: 'Membre 2' },
        { userId: member.userId, name: 'Membre 3' },
      ],
      activeMembers: 3,
    });
    expect(await deletionInfo(admin)).toMatchObject({ isOwner: false, needsSuccessor: false });
    await setRole(admin, 'owner');
    expect(await deletionInfo(owner)).toMatchObject({ isOwner: true, needsSuccessor: false });
  });

  it('ne compte pas un ancien membre comme membre actif', async () => {
    const { people } = await team(['owner', 'member']);
    const [owner, former] = people as [TenantContext, TenantContext];
    await markFormer(former);

    expect(await deletionInfo(owner)).toMatchObject({
      soleActiveMember: true,
      needsSuccessor: false,
      successors: [],
      activeMembers: 1,
    });
  });
});

describe('deleteOrganization', () => {
  it("efface tout, les comptes de ses membres aussi, sauf ceux d'une autre organisation", async () => {
    const { tenantId, people } = await team(['owner', 'member', 'member', 'member']);
    const [owner, member, former, shared] = people as [
      TenantContext,
      TenantContext,
      TenantContext,
      TenantContext,
    ];
    await markFormer(former);
    const other = await team(['owner']);
    const [otherOwner] = other.people as [TenantContext];
    await adminDb.insert(members).values({
      organizationId: otherOwner.tenantId,
      userId: shared.userId,
      role: 'member',
      createdAt: new Date(),
    });
    await seedLogin(member);
    const connectionId = await seedConnection(member);
    await adminDb
      .update(connections)
      .set({
        config: {
          authMode: 'pipedream',
          externalUserId: 'leon-membre',
          accountId: 'apn_3',
        } satisfies PipedreamConfig,
      })
      .where(eq(connections.id, connectionId));
    const source = await seedSource(owner);
    const expected = [
      { email: await emailOf(owner), kind: 'account' },
      { email: await emailOf(member), kind: 'organization' },
      { email: await emailOf(shared), kind: 'organization' },
    ];

    const result = await deleteOrganization(owner);

    expect(result.organizationDeleted).toBe(true);
    expect(result.organizationName).toBe('Organisation de test');
    expect(result.pipedreamUsers).toEqual(['leon-membre']);
    expect(result.notify.toSorted((a, b) => a.email.localeCompare(b.email))).toEqual(
      expected.toSorted((a, b) => a.email.localeCompare(b.email)),
    );
    expect(
      await adminDb.select().from(organizations).where(eq(organizations.id, tenantId)),
    ).toEqual([]);
    expect(await adminDb.select().from(sources).where(eq(sources.id, source.sourceId))).toEqual([]);
    for (const gone of [owner, member, former]) expect(await userRow(gone.userId)).toBeUndefined();
    expect(await userRow(shared.userId)).toBeDefined();
    expect(await userRow(otherOwner.userId)).toBeDefined();
    expect(
      await adminDb.select().from(organizations).where(eq(organizations.id, otherOwner.tenantId)),
    ).toHaveLength(1);
  });

  it('garde le compte du propriétaire qui appartient aussi à une autre organisation', async () => {
    const { tenantId, people } = await team(['owner', 'member']);
    const [owner, member] = people as [TenantContext, TenantContext];
    const other = await team(['owner']);
    const [otherOwner] = other.people as [TenantContext];
    await adminDb.insert(members).values({
      organizationId: otherOwner.tenantId,
      userId: owner.userId,
      role: 'member',
      createdAt: new Date(),
    });

    const expected = [
      { email: await emailOf(owner), kind: 'organization' },
      { email: await emailOf(member), kind: 'organization' },
    ];

    const result = await deleteOrganization(owner);

    expect(result.notify.toSorted((a, b) => a.email.localeCompare(b.email))).toEqual(
      expected.toSorted((a, b) => a.email.localeCompare(b.email)),
    );
    expect(
      await adminDb.select().from(organizations).where(eq(organizations.id, tenantId)),
    ).toEqual([]);
    expect(await userRow(owner.userId)).toBeDefined();
    expect(await userRow(member.userId)).toBeUndefined();
  });

  it("refuse de supprimer l'organisation à qui n'est pas propriétaire", async () => {
    const { tenantId, people } = await team(['owner', 'admin', 'member']);
    const [, admin, member] = people as [TenantContext, TenantContext, TenantContext];
    await markFormer(member);
    const second = await createTestUser(tenantId, 'Simple membre');

    for (const ctx of [admin, second]) {
      await expect(deleteOrganization(ctx)).rejects.toMatchObject({ reason: 'pas_proprietaire' });
    }

    expect(
      await adminDb.select().from(organizations).where(eq(organizations.id, tenantId)),
    ).toHaveLength(1);
  });
});
