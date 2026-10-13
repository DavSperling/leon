import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { members, organizations, users } from '@/server/db/schema/auth';
import { adminDb, adminPool } from '@/test/db';
import { auth } from './auth';
import { createUserWithOrganization, type SignUpInput } from './sign-up';
import { resolveTenantContext } from './tenant-context';

afterEach(() => vi.restoreAllMocks());

const input = (overrides: Partial<SignUpInput> = {}): SignUpInput => ({
  name: 'Paul Martin',
  email: `paul-${randomUUID()}@example.com`,
  password: 'motdepasse-solide',
  organizationName: 'Dupont Rénovation',
  ...overrides,
});

describe('createUserWithOrganization', () => {
  it("crée l'utilisateur, son organisation et son appartenance de propriétaire", async () => {
    const result = await createUserWithOrganization(input());
    if (!result.ok) throw new Error(`inscription refusée : ${result.error}`);

    const [org] = await adminDb
      .select()
      .from(organizations)
      .where(eq(organizations.id, result.tenantId));
    expect(org?.name).toBe('Dupont Rénovation');
    expect(org?.slug).toMatch(/^dupont-renovation-[a-z0-9]{6}$/);
    const rows = await adminDb.select().from(members).where(eq(members.userId, result.userId));
    expect(rows).toEqual([
      expect.objectContaining({ organizationId: result.tenantId, role: 'owner' }),
    ]);

    expect(await resolveTenantContext(result.userId, null)).toEqual({
      tenantId: result.tenantId,
      userId: result.userId,
      principals: [result.userId, result.tenantId],
    });
  });

  it("ouvre une session qui porte l'organisation de l'utilisateur", async () => {
    const data = input();
    const result = await createUserWithOrganization(data);
    if (!result.ok) throw new Error(`inscription refusée : ${result.error}`);

    const signedIn = await auth.api.signInEmail({
      body: { email: data.email, password: data.password },
    });
    const { rows } = await adminPool.query(
      'select "activeOrganizationId" from session where token = $1',
      [signedIn.token],
    );
    expect(rows).toEqual([{ activeOrganizationId: result.tenantId }]);
  });

  it('refuse un e-mail déjà pris, quelle que soit la casse', async () => {
    const first = input();
    expect((await createUserWithOrganization(first)).ok).toBe(true);
    const again = await createUserWithOrganization({ ...first, email: first.email.toUpperCase() });
    expect(again).toEqual({ ok: false, error: 'email_pris' });
  });

  it('refuse un mot de passe de 7 caractères', async () => {
    expect(await createUserWithOrganization(input({ password: '1234567' }))).toEqual({
      ok: false,
      error: 'invalide',
    });
  });

  it("supprime l'utilisateur si l'organisation ne peut pas être créée", async () => {
    const data = input();
    vi.spyOn(auth.api, 'createOrganization').mockRejectedValueOnce(new Error('panne'));

    expect(await createUserWithOrganization(data)).toEqual({ ok: false, error: 'invalide' });
    expect(await adminDb.select().from(users).where(eq(users.email, data.email))).toEqual([]);
    expect((await createUserWithOrganization(data)).ok).toBe(true);
  });
});
