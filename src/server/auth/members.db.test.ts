import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { members } from '@/server/db/schema/auth';
import { invitationLinks } from '@/server/db/schema/invitation-links';
import { adminDb } from '@/test/db';
import { createTestTenant, createTestUser } from '@/test/fixtures';
import { deleteAccount } from './delete-account';
import {
  canInvite,
  createInvitationLink,
  findInvitation,
  getMembership,
  joinWithInvitation,
  listMembers,
  setMemberPlacement,
} from './members';
import type { TenantContext } from './tenant-context';

const backend = { department: 'engineering', job: 'backend', seniority: 3 } as const;

const setRole = (ctx: TenantContext, role: string) =>
  adminDb
    .update(members)
    .set({ role })
    .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)));

// Une organisation dont le premier membre est propriétaire, et un lien qu'il vient de créer.
async function tenantWithLink() {
  const { tenantId, members: people } = await createTestTenant(['Amos', 'David']);
  const [owner, member] = people as [TenantContext, TenantContext];
  await setRole(owner, 'owner');
  const link = await createInvitationLink(owner, { name: '', placement: backend });
  if (!link) throw new Error('lien non créé');
  return { tenantId, owner, member, token: link.token };
}

// Un utilisateur sans organisation, comme juste après signUpEmail.
async function lonelyUser(): Promise<string> {
  const { members: people } = await createTestTenant(['Invité']);
  const [ctx] = people as [TenantContext];
  await adminDb.delete(members).where(eq(members.userId, ctx.userId));
  return ctx.userId;
}

const membership = (userId: string) =>
  adminDb
    .select({ organizationId: members.organizationId, role: members.role })
    .from(members)
    .where(eq(members.userId, userId));

describe('createInvitationLink', () => {
  it("ne stocke que l'empreinte du lien, valable 7 jours", async () => {
    const { tenantId, owner, token } = await tenantWithLink();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const rows = await adminDb
      .select()
      .from(invitationLinks)
      .where(eq(invitationLinks.tenantId, tenantId));
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row?.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(row?.createdBy).toBe(owner.userId);
    expect(row?.usedAt).toBeNull();
    const days = ((row?.expiresAt.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);
  });

  it("refuse un simple membre, et accepte un administrateur, même parmi d'autres rôles", async () => {
    const { member } = await tenantWithLink();
    expect(await canInvite(member)).toBe(false);
    expect(await createInvitationLink(member, { name: '', placement: backend })).toBeNull();

    await setRole(member, 'member,admin');
    expect(await canInvite(member)).toBe(true);
    expect(await createInvitationLink(member, { name: '', placement: backend })).not.toBeNull();
  });
});

describe('findInvitation', () => {
  it("rend le nom de l'organisation d'un lien utilisable", async () => {
    const { token } = await tenantWithLink();
    expect(await findInvitation(token)).toEqual({ organizationName: 'Organisation de test' });
  });

  it('ne reconnaît ni un lien inconnu ni une valeur mal formée', async () => {
    expect(await findInvitation('A'.repeat(43))).toBeNull();
    expect(await findInvitation("x' or 1=1 --")).toBeNull();
    expect(await findInvitation('')).toBeNull();
  });

  it('refuse un lien expiré', async () => {
    const { tenantId, token } = await tenantWithLink();
    await adminDb
      .update(invitationLinks)
      .set({
        createdAt: new Date(Date.now() - 8 * 86_400_000),
        expiresAt: new Date(Date.now() - 1),
      })
      .where(eq(invitationLinks.tenantId, tenantId));

    expect(await findInvitation(token)).toBeNull();
    expect(await joinWithInvitation(token, await lonelyUser())).toBeNull();
  });

  it("refuse le lien d'un administrateur rétrogradé ou parti", async () => {
    const demoted = await tenantWithLink();
    await setRole(demoted.owner, 'member');
    expect(await findInvitation(demoted.token)).toBeNull();

    const gone = await tenantWithLink();
    await adminDb.delete(members).where(eq(members.userId, gone.owner.userId));
    expect(await findInvitation(gone.token)).toBeNull();
    expect(await joinWithInvitation(gone.token, await lonelyUser())).toBeNull();
  });
});

describe('joinWithInvitation', () => {
  it("fait de l'utilisateur un simple membre de l'organisation du lien, une seule fois", async () => {
    const { tenantId, token } = await tenantWithLink();
    const userId = await lonelyUser();

    expect(await joinWithInvitation(token, userId)).toBe(tenantId);
    expect(await membership(userId)).toEqual([{ organizationId: tenantId, role: 'member' }]);

    expect(await findInvitation(token)).toBeNull();
    const other = await lonelyUser();
    expect(await joinWithInvitation(token, other)).toBeNull();
    expect(await membership(other)).toEqual([]);
  });

  it('ne sert le lien qu’à une inscription sur deux simultanées', async () => {
    const { tenantId, token } = await tenantWithLink();
    const [a, b] = [await lonelyUser(), await lonelyUser()];

    const results = await Promise.all([joinWithInvitation(token, a), joinWithInvitation(token, b)]);

    expect(results.filter((r) => r === tenantId)).toHaveLength(1);
    expect(results.filter((r) => r === null)).toHaveLength(1);
    expect([...(await membership(a)), ...(await membership(b))]).toHaveLength(1);
  });
});

describe('listMembers', () => {
  it("liste les membres de l'organisation du lecteur, et eux seuls", async () => {
    const { owner } = await tenantWithLink();
    await createTestTenant(['Ailleurs']);
    await createTestUser(owner.tenantId, 'Julie');

    const rows = await listMembers(owner);
    expect(rows.map((r) => [r.name, r.role])).toEqual([
      ['Amos', 'owner'],
      ['David', 'member'],
      ['Julie', 'member'],
    ]);
    expect(rows.at(-1)?.email).toMatch(/@test\.leon$/);
  });

  it('rend les anciens membres marqués, sans leur adresse', async () => {
    const { owner, member } = await tenantWithLink();
    await createTestUser(owner.tenantId, 'Julie');
    await deleteAccount(member, null, false);

    const rows = await listMembers(owner);
    expect(rows.map((r) => [r.name, r.former])).toEqual([
      ['Amos', false],
      ['David', true],
      ['Julie', false],
    ]);
    expect(rows.filter((r) => r.former).map((r) => r.email)).toEqual(['']);
    expect(rows.filter((r) => !r.former).every((r) => r.email.endsWith('@test.leon'))).toBe(true);
  });
});

describe('getMembership', () => {
  it("rend le rôle, l'organisation et la date d'arrivée du lecteur, et rien hors de son organisation", async () => {
    const { owner } = await tenantWithLink();
    const mine = await getMembership(owner);
    expect(mine).toMatchObject({ role: 'owner', organizationName: 'Organisation de test' });
    expect(mine?.since).toBeInstanceOf(Date);

    const { members: people } = await createTestTenant(['Ailleurs']);
    const [stranger] = people as [TenantContext];
    expect(await getMembership({ ...stranger, tenantId: owner.tenantId })).toBeNull();
  });
});

const placementOf = async (ctx: TenantContext) =>
  (
    await adminDb
      .select({
        department: members.department,
        job: members.job,
        seniority: members.seniority,
        role: members.role,
        goals: members.goals,
        onboardedAt: members.onboardedAt,
      })
      .from(members)
      .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)))
  )[0];

const memberIdOf = async (ctx: TenantContext) => {
  const [row] = await adminDb
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)));
  if (!row) throw new Error('membre introuvable');
  return row.id;
};

const noPlacement = { department: null, job: null, seniority: null };

const linkRow = async (token: string) => {
  const [row] = await adminDb
    .select()
    .from(invitationLinks)
    .where(eq(invitationLinks.tokenHash, createHash('sha256').update(token).digest('hex')));
  if (!row) throw new Error('lien introuvable');
  return row;
};

const linkFor = async (owner: TenantContext, name: string) => {
  const link = await createInvitationLink(owner, { name, placement: backend });
  if (!link) throw new Error('lien non créé');
  return link;
};

describe('le poste porté par un lien', () => {
  it('le lien porte le poste, recopié sur le membre qui rejoint', async () => {
    const { tenantId, owner } = await tenantWithLink();
    const link = await linkFor(owner, 'Inès');
    const inesId = await lonelyUser();

    expect(await joinWithInvitation(link.token, inesId)).toBe(tenantId);

    const [row] = await adminDb.select().from(members).where(eq(members.userId, inesId));
    expect(row).toMatchObject({ ...backend, role: 'member', onboardedAt: null });
    expect(await linkRow(link.token)).toMatchObject({ ...backend, inviteeName: 'Inès' });
    expect((await linkRow((await linkFor(owner, '')).token)).inviteeName).toBeNull();
  });

  it("un lien d'avant ce lot, sans poste, fait toujours entrer", async () => {
    const { tenantId, owner } = await tenantWithLink();
    const link = await linkFor(owner, 'Inès');
    await adminDb
      .update(invitationLinks)
      .set({ inviteeName: null, department: null, job: null, seniority: null })
      .where(eq(invitationLinks.id, (await linkRow(link.token)).id));
    const inesId = await lonelyUser();

    expect(await joinWithInvitation(link.token, inesId)).toBe(tenantId);
    const [row] = await adminDb.select().from(members).where(eq(members.userId, inesId));
    expect(row).toMatchObject(noPlacement);
  });

  it('la base refuse un niveau hors de 1 à 8 sur un lien', async () => {
    const { tenantId } = await tenantWithLink();
    await expect(
      adminDb
        .update(invitationLinks)
        .set({ seniority: 9 })
        .where(eq(invitationLinks.tenantId, tenantId)),
    ).rejects.toThrow();
  });
});

describe('le poste des membres', () => {
  let tenantId: string;
  let ana: TenantContext;
  let bob: TenantContext;

  beforeEach(async () => {
    const tenant = await createTestTenant(['Ana', 'Bob']);
    tenantId = tenant.tenantId;
    [ana, bob] = tenant.members as [TenantContext, TenantContext];
    await setRole(ana, 'admin');
  });

  it('listMembers rend le poste de chacun', async () => {
    await adminDb
      .update(members)
      .set({ department: 'sales', job: 'sdr', seniority: 2 })
      .where(and(eq(members.userId, bob.userId), eq(members.organizationId, tenantId)));

    const rows = await listMembers(ana);
    expect(rows.find((r) => r.name === 'Bob')).toMatchObject({
      department: 'sales',
      job: 'sdr',
      seniority: 2,
    });
    expect(rows.find((r) => r.name === 'Ana')).toMatchObject(noPlacement);
  });

  it('listMembers ne rend le poste de personne à un simple membre, le sien compris', async () => {
    for (const person of [ana, bob]) {
      await adminDb
        .update(members)
        .set({ department: 'sales', job: 'sdr', seniority: 2 })
        .where(and(eq(members.userId, person.userId), eq(members.organizationId, tenantId)));
    }

    const seenByMember = await listMembers(bob);
    expect(seenByMember).toHaveLength(2);
    expect(seenByMember.every((r) => r.department === null && r.job === null)).toBe(true);
    expect(seenByMember.every((r) => r.seniority === null)).toBe(true);

    await setRole(bob, 'member,admin');
    const seenByAdmin = await listMembers(bob);
    expect(seenByAdmin.every((r) => r.department === 'sales' && r.seniority === 2)).toBe(true);
  });

  it("un administrateur fixe le poste d'un membre, sans toucher au reste", async () => {
    expect(await setMemberPlacement(ana, await memberIdOf(bob), backend)).toBe(true);
    expect(await placementOf(bob)).toEqual({
      ...backend,
      role: 'member',
      goals: [],
      onboardedAt: null,
    });
  });

  it('un administrateur fixe aussi son propre poste', async () => {
    expect(await setMemberPlacement(ana, await memberIdOf(ana), backend)).toBe(true);
    expect(await placementOf(ana)).toMatchObject({ ...backend, role: 'admin' });
  });

  it("un membre ne fixe ni le sien ni celui d'un autre", async () => {
    const [anaId, bobId] = [await memberIdOf(ana), await memberIdOf(bob)];
    expect(await setMemberPlacement(bob, bobId, backend)).toBe(false);
    expect(await setMemberPlacement(bob, anaId, backend)).toBe(false);
    expect(await placementOf(bob)).toMatchObject(noPlacement);
    expect(await placementOf(ana)).toMatchObject(noPlacement);
  });

  it("un administrateur d'un autre espace ne touche pas à ce membre", async () => {
    const other = await createTestTenant(['Zoé']);
    const [zoe] = other.members as [TenantContext];
    await setRole(zoe, 'admin');

    expect(await setMemberPlacement(zoe, await memberIdOf(bob), backend)).toBe(false);
    expect(await placementOf(bob)).toMatchObject(noPlacement);
  });
});
