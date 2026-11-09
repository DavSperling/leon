import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { members, users } from '@/server/db/schema/auth';
import { adminDb } from '@/test/db';
import { createUserWithOrganization } from './sign-up';
import {
  firstOrganizationId,
  principalsFor,
  resolveSessionContext,
  resolveTenantContext,
} from './tenant-context';

async function signUp(name: string): Promise<{ userId: string; tenantId: string }> {
  const result = await createUserWithOrganization({
    name,
    email: `${name.toLowerCase()}-${randomUUID()}@example.com`,
    password: 'motdepasse-solide',
    organizationName: `Organisation de ${name}`,
  });
  if (!result.ok) throw new Error(`inscription refusée : ${result.error}`);
  return result;
}

describe('principalsFor', () => {
  it("renvoie soi puis l'équipe, sans groupe pour qui n'a ni service ni groupe libre", async () => {
    const paul = await signUp('Paul');
    expect(await principalsFor(paul.userId, paul.tenantId)).toEqual([paul.userId, paul.tenantId]);
  });
});

describe('resolveTenantContext', () => {
  it("donne le contexte d'un membre pour son organisation", async () => {
    const paul = await signUp('Paul');
    expect(await firstOrganizationId(paul.userId)).toBe(paul.tenantId);
    expect(await resolveTenantContext(paul.userId, paul.tenantId)).toEqual({
      tenantId: paul.tenantId,
      userId: paul.userId,
      principals: [paul.userId, paul.tenantId],
    });
  });

  it("renvoie null pour un utilisateur hors de l'organisation", async () => {
    const paul = await signUp('Paul');
    const zoe = await signUp('Zoe');
    expect(await resolveTenantContext(zoe.userId, paul.tenantId)).toBeNull();
  });

  // Une réinitialisation de mot de passe ou un rappel OAuth arrivés pendant la suppression ouvrent une session :
  // l'ancien membre n'entre pourtant nulle part.
  it("renvoie null pour un ancien membre, qui reste pourtant dans l'organisation", async () => {
    const paul = await signUp('Paul');
    await adminDb.update(users).set({ deletedAt: new Date() }).where(eq(users.id, paul.userId));

    expect(await firstOrganizationId(paul.userId)).toBeNull();
    expect(await resolveTenantContext(paul.userId, null)).toBeNull();
    expect(await resolveTenantContext(paul.userId, paul.tenantId)).toBeNull();
  });

  it('renvoie null pour un utilisateur sans organisation', async () => {
    expect(await firstOrganizationId(randomUUID())).toBeNull();
    expect(await resolveTenantContext(randomUUID(), null)).toBeNull();
  });

  it("renvoie null, sans lever, pour un id qui n'est pas un UUID", async () => {
    const paul = await signUp('Paul');
    expect(await resolveTenantContext(paul.userId, 'pas-un-uuid')).toBeNull();
    expect(await resolveTenantContext('pas-un-uuid', paul.tenantId)).toBeNull();
  });
});

describe('resolveSessionContext', () => {
  it("rend l'organisation active quand la personne en est membre, même si ce n'est pas la première", async () => {
    const paul = await signUp('Paul');
    const zoe = await signUp('Zoe');
    await adminDb.insert(members).values({
      organizationId: zoe.tenantId,
      userId: paul.userId,
      role: 'member',
      createdAt: new Date(),
    });

    const ctx = await resolveSessionContext(paul.userId, zoe.tenantId);

    expect(ctx?.tenantId).toBe(zoe.tenantId);
  });

  it("se rabat sur la première organisation quand l'organisation active n'est plus la sienne", async () => {
    const paul = await signUp('Paul');
    const zoe = await signUp('Zoe');

    expect(await resolveSessionContext(paul.userId, zoe.tenantId)).toEqual(
      await resolveTenantContext(paul.userId, paul.tenantId),
    );
  });

  it('prend la première organisation sans organisation active', async () => {
    const paul = await signUp('Paul');

    expect((await resolveSessionContext(paul.userId, null))?.tenantId).toBe(paul.tenantId);
  });

  it("rend null sans aucune organisation, qu'il y en ait une d'active ou non", async () => {
    const paul = await signUp('Paul');

    expect(await resolveSessionContext(randomUUID(), paul.tenantId)).toBeNull();
    expect(await resolveSessionContext(randomUUID(), null)).toBeNull();
  });
});
