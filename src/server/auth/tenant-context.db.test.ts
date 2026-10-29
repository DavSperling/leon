import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { users } from '@/server/db/schema/auth';
import { adminDb } from '@/test/db';
import { createUserWithOrganization } from './sign-up';
import { firstOrganizationId, principalsFor, resolveTenantContext } from './tenant-context';

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
  it("renvoie soi puis l'équipe", () => {
    expect(principalsFor('u', 't')).toEqual(['u', 't']);
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
