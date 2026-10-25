import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { members } from '@/server/db/schema/auth';
import { invitationLinks } from '@/server/db/schema/invitation-links';
import { adminDb } from '@/test/db';
import { createTestTenant, createTestUser } from '@/test/fixtures';
import {
  canInvite,
  createInvitationLink,
  findInvitation,
  joinWithInvitation,
  listMembers,
} from './members';
import type { TenantContext } from './tenant-context';

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
  const link = await createInvitationLink(owner);
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
    expect(await createInvitationLink(member)).toBeNull();

    await setRole(member, 'member,admin');
    expect(await canInvite(member)).toBe(true);
    expect(await createInvitationLink(member)).not.toBeNull();
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
});
