import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { members, organizations, users } from '@/server/db/schema/auth';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { auth } from './auth';
import { createInvitationLink, findInvitation } from './members';
import {
  createOrganizationForUser,
  createUserWithInvitation,
  createUserWithOrganization,
  type JoinInput,
  ORGANIZATION_LOCK_NAMESPACE,
  type SignUpInput,
} from './sign-up';
import { resolveTenantContext, type TenantContext } from './tenant-context';

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

  // `.invalid` est réservé (RFC 2606) : l'adresse d'un ancien membre (ancien-<id>@leon.invalid) ne s'inscrit pas.
  it.each(['leon.invalid', 'LEON.INVALID', 'invalid.invalid'])(
    'refuse une adresse en @%s, sans créer de compte',
    async (domain) => {
      const email = `ancien-${randomUUID()}@${domain}`;
      expect(await createUserWithOrganization(input({ email }))).toEqual({
        ok: false,
        error: 'invalide',
      });
      expect(await userByEmail(email.toLowerCase())).toEqual([]);
    },
  );

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

// Une personne connectée qui n'a pas (ou plus) d'espace : un utilisateur sans appartenance.
async function userWithoutSpace(): Promise<string> {
  const [user] = await adminDb
    .insert(users)
    .values({ name: 'Léa', email: `lea-${randomUUID()}@example.com`, emailVerified: false })
    .returning({ id: users.id });
  if (!user) throw new Error('utilisateur de test non créé');
  return user.id;
}

const membershipsOf = (userId: string) =>
  adminDb.select().from(members).where(eq(members.userId, userId));

describe('createOrganizationForUser', () => {
  it("crée l'espace d'une personne qui n'en a pas, dont elle devient propriétaire", async () => {
    const userId = await userWithoutSpace();

    const result = await createOrganizationForUser(userId, 'Acme');
    if (!result.ok) throw new Error(`création refusée : ${result.error}`);

    expect(await membershipsOf(userId)).toEqual([
      expect.objectContaining({ organizationId: result.tenantId, role: 'owner' }),
    ]);
    const [org] = await adminDb
      .select()
      .from(organizations)
      .where(eq(organizations.id, result.tenantId));
    expect(org?.name).toBe('Acme');
  });

  it('refuse de créer un deuxième espace (double clic)', async () => {
    const userId = await userWithoutSpace();
    expect((await createOrganizationForUser(userId, 'Acme')).ok).toBe(true);

    expect(await createOrganizationForUser(userId, 'Acme')).toEqual({
      ok: false,
      error: 'deja_membre',
    });
    expect(await membershipsOf(userId)).toHaveLength(1);
  });

  it('deux envois simultanés (deux onglets) ne créent qu’un espace', async () => {
    const userId = await userWithoutSpace();

    const [a, b] = await Promise.all([
      createOrganizationForUser(userId, 'Acme'),
      createOrganizationForUser(userId, 'Acme'),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await membershipsOf(userId)).toHaveLength(1);
  });

  it('deux envois simultanés de deux personnes créent chacun leur espace', async () => {
    const [first, second] = [await userWithoutSpace(), await userWithoutSpace()];

    const results = await Promise.all([
      createOrganizationForUser(first, 'Acme'),
      createOrganizationForUser(second, 'Beta'),
    ]);

    expect(results.map((r) => r.ok)).toEqual([true, true]);
    expect(await membershipsOf(first)).toHaveLength(1);
    expect(await membershipsOf(second)).toHaveLength(1);
  });

  it("attend le verrou d'une autre instance, puis rend deja_membre si elle a créé l'espace", async () => {
    const userId = await userWithoutSpace();
    const otherInstance = await adminPool.connect();
    try {
      const lockKey = [ORGANIZATION_LOCK_NAMESPACE, userId];
      await otherInstance.query('select pg_advisory_lock($1, hashtext($2))', lockKey);
      let settled = false;
      const pending = createOrganizationForUser(userId, 'Acme').finally(() => {
        settled = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(settled).toBe(false);

      // Ce que l'autre instance a fait sous le verrou : l'espace de la personne.
      const { tenantId } = await createTestTenant([]);
      await adminDb
        .insert(members)
        .values({ organizationId: tenantId, userId, role: 'owner', createdAt: new Date() });
      await otherInstance.query('select pg_advisory_unlock($1, hashtext($2))', lockKey);

      expect(await pending).toEqual({ ok: false, error: 'deja_membre' });
      expect(await membershipsOf(userId)).toHaveLength(1);
    } finally {
      otherInstance.release(true); // fermée : un verrou resté pris meurt avec la connexion
    }
  });

  it('refuse un nom vide', async () => {
    const userId = await userWithoutSpace();
    expect(await createOrganizationForUser(userId, '')).toEqual({ ok: false, error: 'invalide' });
    expect(await membershipsOf(userId)).toEqual([]);
  });
});

// Une organisation dont le propriétaire vient de créer un lien d'invitation.
async function invitation(): Promise<{ tenantId: string; token: string }> {
  const { tenantId, members: people } = await createTestTenant(['Amos']);
  const [owner] = people as [TenantContext];
  await adminDb.update(members).set({ role: 'owner' }).where(eq(members.userId, owner.userId));
  const link = await createInvitationLink(owner, {
    name: '',
    placement: { department: 'engineering', job: 'backend', seniority: 3 },
  });
  if (!link) throw new Error('lien non créé');
  return { tenantId, token: link.token };
}

const joinInput = (token: string, overrides: Partial<JoinInput> = {}): JoinInput => ({
  name: 'Julie Petit',
  email: `julie-${randomUUID()}@example.com`,
  password: 'motdepasse-solide',
  token,
  ...overrides,
});

const userByEmail = (email: string) =>
  adminDb.select({ id: users.id }).from(users).where(eq(users.email, email));

describe('createUserWithInvitation', () => {
  it("crée un simple membre de l'organisation du lien, sans organisation à lui", async () => {
    const { tenantId, token } = await invitation();
    const data = joinInput(token);

    const result = await createUserWithInvitation(data);
    if (!result.ok) throw new Error(`inscription refusée : ${result.error}`);
    expect(result.tenantId).toBe(tenantId);

    const rows = await adminDb.select().from(members).where(eq(members.userId, result.userId));
    expect(rows).toEqual([expect.objectContaining({ organizationId: tenantId, role: 'member' })]);
    expect(await resolveTenantContext(result.userId, null)).toEqual({
      tenantId,
      userId: result.userId,
      principals: [result.userId, tenantId],
    });

    // La session qui suit l'inscription s'ouvre dans l'organisation du lien.
    const signedIn = await auth.api.signInEmail({
      body: { email: data.email, password: data.password },
    });
    const { rows: sessions } = await adminPool.query(
      'select "activeOrganizationId" from session where token = $1',
      [signedIn.token],
    );
    expect(sessions).toEqual([{ activeOrganizationId: tenantId }]);
    expect(await findInvitation(token)).toBeNull();
  });

  it("refuse l'adresse réservée d'un ancien membre, et laisse le lien utilisable", async () => {
    const { token } = await invitation();
    const email = `ancien-${randomUUID()}@leon.invalid`;

    expect(await createUserWithInvitation(joinInput(token, { email }))).toEqual({
      ok: false,
      error: 'invalide',
    });

    expect(await userByEmail(email)).toEqual([]);
    expect(await findInvitation(token)).not.toBeNull();
  });

  it('ne crée aucun compte avec un lien déjà servi', async () => {
    const { token } = await invitation();
    expect((await createUserWithInvitation(joinInput(token))).ok).toBe(true);

    const late = joinInput(token);
    expect(await createUserWithInvitation(late)).toEqual({ ok: false, error: 'lien_invalide' });
    expect(await userByEmail(late.email)).toEqual([]);
  });

  it('refuse un e-mail déjà pris et laisse le lien utilisable', async () => {
    const { token } = await invitation();
    const taken = input();
    expect((await createUserWithOrganization(taken)).ok).toBe(true);

    expect(await createUserWithInvitation(joinInput(token, { email: taken.email }))).toEqual({
      ok: false,
      error: 'email_pris',
    });
    expect(await findInvitation(token)).not.toBeNull();
  });

  it('de deux inscriptions simultanées, garde une seule et supprime le compte de l’autre', async () => {
    const { token } = await invitation();
    const [first, second] = [joinInput(token), joinInput(token)];

    const results = await Promise.all([
      createUserWithInvitation(first),
      createUserWithInvitation(second),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: 'lien_invalide' }]);
    const accounts = [...(await userByEmail(first.email)), ...(await userByEmail(second.email))];
    expect(accounts).toHaveLength(1);
  });
});
