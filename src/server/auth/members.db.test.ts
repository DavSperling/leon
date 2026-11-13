import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { members } from '@/server/db/schema/auth';
import { invitationLinks } from '@/server/db/schema/invitation-links';
import { reportingLines } from '@/server/db/schema/organisation';
import { dropPoints, pointIsStale, queuedRefreshes, seedPoint } from '@/test/briefing-points';
import { adminDb } from '@/test/db';
import { createTestTenant, createTestUser } from '@/test/fixtures';
import { deleteAccount } from './delete-account';
import {
  cancelInvitation,
  canInvite,
  createInvitationLink,
  findInvitation,
  getMembership,
  invitationToSend,
  joinWithInvitation,
  listInvitations,
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
        // Une minute et non quelques ms : l'horloge de Postgres (Docker) retarde de ~10 ms sur celle de l'hôte.
        expiresAt: new Date(Date.now() - 60_000),
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
    expect(rows.map((r) => r.self)).toEqual([true, false, false]);
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
    expect(await linkRow(link.token)).toMatchObject({ ...backend, inviteeName: 'Inès' });
    expect((await linkRow((await linkFor(owner, '')).token)).inviteeName).toBeNull();

    expect(await joinWithInvitation(link.token, inesId)).toBe(tenantId);

    const [row] = await adminDb.select().from(members).where(eq(members.userId, inesId));
    expect(row).toMatchObject({ ...backend, role: 'member', onboardedAt: null });
    // Le lien garde le poste mais plus le nom saisi.
    expect(await linkRow(link.token)).toMatchObject({ ...backend, inviteeName: null });
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
  const tenantIds: string[] = [];
  let tenantId: string;
  let ana: TenantContext;
  let bob: TenantContext;

  beforeEach(async () => {
    const tenant = await createTestTenant(['Ana', 'Bob']);
    tenantId = tenant.tenantId;
    tenantIds.push(tenantId);
    [ana, bob] = tenant.members as [TenantContext, TenantContext];
    await setRole(ana, 'admin');
  });

  // Les points marqués périmés touchent le vrai pg-boss de la base de test : on retire leurs travaux à la fin.
  afterAll(() => dropPoints(tenantIds));

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
    expect(
      seenByAdmin.every((r) => r.department === 'sales' && r.job === 'sdr' && r.seniority === 2),
    ).toBe(true);
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

  it("le poste de Bob change : ses points sont périmés et remis en file, pas ceux de l'administrateur", async () => {
    const bobs = await seedPoint(bob);
    const anas = await seedPoint(ana);

    expect(await setMemberPlacement(ana, await memberIdOf(bob), backend)).toBe(true);

    expect(await pointIsStale(bob, bobs)).toBe(true);
    expect(await pointIsStale(ana, anas)).toBe(false);
    const [queued] = await queuedRefreshes(bob, bobs);
    expect((queued?.startAfter.getTime() ?? 0) - Date.now()).toBeGreaterThan(20 * 60_000);
    expect(await queuedRefreshes(ana, anas)).toEqual([]);
  });

  it('un refus ne marque aucun point', async () => {
    const bobs = await seedPoint(bob);

    expect(await setMemberPlacement(bob, await memberIdOf(bob), backend)).toBe(false);

    expect(await pointIsStale(bob, bobs)).toBe(false);
    expect(await queuedRefreshes(bob, bobs)).toEqual([]);
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

// Écran Équipe : le manager porté par un lien (0065), les invitations en attente, leur annulation, leur envoi.
describe("l'invitation sous un manager", () => {
  const tokenOf = async (ctx: TenantContext, managerId: string | null) => {
    const link = await createInvitationLink(ctx, { name: 'Inès', placement: backend, managerId });
    if (!link) throw new Error('lien non créé');
    return link.token;
  };
  const lineOf = (memberId: string) =>
    adminDb
      .select({ managerId: reportingLines.managerId })
      .from(reportingLines)
      .where(eq(reportingLines.memberId, memberId));

  it('rattache le nouveau membre au manager du lien, à la main (l’annuaire n’y touche pas)', async () => {
    const { tenantId, owner, member } = await tenantWithLink();
    const davidId = await memberIdOf(member);
    const token = await tokenOf(owner, davidId);
    const userId = await lonelyUser();

    expect(await joinWithInvitation(token, userId)).toBe(tenantId);
    const [joined] = await adminDb
      .select({ id: members.id, manuel: members.rattachementManuel })
      .from(members)
      .where(eq(members.userId, userId));
    if (!joined) throw new Error('membre absent');
    expect(joined.manuel).toBe(true);
    expect(await lineOf(joined.id)).toEqual([{ managerId: davidId }]);
  });

  it('fait entrer sans rattachement quand le manager est parti depuis', async () => {
    const { tenantId, owner, member } = await tenantWithLink();
    const davidId = await memberIdOf(member);
    const token = await tokenOf(owner, davidId);
    await adminDb.delete(members).where(eq(members.id, davidId));
    const userId = await lonelyUser();

    expect(await joinWithInvitation(token, userId)).toBe(tenantId);
    const [joined] = await adminDb
      .select({ id: members.id })
      .from(members)
      .where(eq(members.userId, userId));
    expect(await lineOf(joined?.id ?? '')).toEqual([]);
  });

  it("refuse un manager d'une autre organisation", async () => {
    const { owner } = await tenantWithLink();
    const other = await createTestTenant(['Zoé']);
    const [zoe] = other.members as [TenantContext];
    const zoeId = await memberIdOf(zoe);

    expect(
      await createInvitationLink(owner, { name: '', placement: backend, managerId: zoeId }),
    ).toBeNull();
    expect(
      await createInvitationLink(owner, { name: '', placement: backend, managerId: 'pas-un-id' }),
    ).toBeNull();
  });

  it('liste les liens en attente aux seuls administrateurs, sans les servis ni les expirés', async () => {
    const { tenantId, owner, member } = await tenantWithLink();
    const davidId = await memberIdOf(member);
    await tokenOf(owner, davidId);
    const used = await tokenOf(owner, null);
    await joinWithInvitation(used, await lonelyUser());
    const expired = await tokenOf(owner, null);
    await adminDb
      .update(invitationLinks)
      .set({ createdAt: new Date(Date.now() - 2000), expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitationLinks.tokenHash, createHash('sha256').update(expired).digest('hex')));

    const pending = await listInvitations(owner);
    // le lien de tenantWithLink (sans nom) et celui sous David
    expect(pending).toHaveLength(2);
    expect(pending).toContainEqual(
      expect.objectContaining({ name: 'Inès', managerId: davidId, job: 'backend' }),
    );
    expect(await listInvitations(member)).toEqual([]);
    const other = await createTestTenant(['Zoé']);
    const [zoe] = other.members as [TenantContext];
    await setRole(zoe, 'owner');
    expect(await listInvitations(zoe)).toEqual([]);
    expect(tenantId).toBeTruthy();
  });

  it("annule un lien : il ne fait plus entrer personne ; ni un membre ni un autre espace ne l'annulent", async () => {
    const { owner, member, token } = await tenantWithLink();
    const [link] = await listInvitations(owner);
    if (!link) throw new Error('lien absent');
    const other = await createTestTenant(['Zoé']);
    const [zoe] = other.members as [TenantContext];
    await setRole(zoe, 'owner');

    expect(await cancelInvitation(member, link.id)).toBe(false);
    expect(await cancelInvitation(zoe, link.id)).toBe(false);
    expect(await cancelInvitation(owner, 'pas-un-id')).toBe(false);
    expect(await cancelInvitation(owner, link.id)).toBe(true);
    expect(await findInvitation(token)).toBeNull();
    expect(await listInvitations(owner)).toEqual([]);
  });

  it("ne laisse envoyer qu'un lien utilisable de son organisation, par qui peut inviter", async () => {
    const { owner, member, token } = await tenantWithLink();
    const other = await createTestTenant(['Zoé']);
    const [zoe] = other.members as [TenantContext];
    await setRole(zoe, 'owner');

    expect(await invitationToSend(owner, token)).toMatchObject({
      organizationName: 'Organisation de test',
    });
    expect(await invitationToSend(member, token)).toBeNull();
    expect(await invitationToSend(zoe, token)).toBeNull();
    expect(await invitationToSend(owner, 'x'.repeat(43))).toBeNull();
    await joinWithInvitation(token, await lonelyUser());
    expect(await invitationToSend(owner, token)).toBeNull();
  });
});
