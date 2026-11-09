import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { members, ssoProviders } from '@/server/db/schema/auth';
import { adminDb } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { auth } from './auth';
import { requestHeaders } from './session';
import { anyVerifiedSso, readSsoSetup, registerSso, removeSso, verifySsoDomain } from './sso';
import type { TenantContext } from './tenant-context';

// Hors requête Next, les en-têtes de la session viennent du test.
vi.mock('./session', async (original) => ({
  ...(await original<typeof import('./session')>()),
  requestHeaders: vi.fn(),
}));

const IDP = 'https://idp.example.com';

// Un propriétaire connecté pour de vrai (Better Auth vérifie la session des routes du SSO) et un simple membre.
async function workspace() {
  const { tenantId, members: people } = await createTestTenant(['Membre']);
  const [member] = people as [TenantContext];
  const email = `${randomUUID()}@test.leon`;
  const password = 'mot-de-passe-de-test';
  const { user } = await auth.api.signUpEmail({ body: { name: 'Propriétaire', email, password } });
  await adminDb
    .insert(members)
    .values({ organizationId: tenantId, userId: user.id, role: 'owner', createdAt: new Date() });
  const signedIn = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
  const cookie = signedIn.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const owner: TenantContext = { ...member, userId: user.id, principals: [] };
  vi.mocked(requestHeaders).mockResolvedValue(new Headers({ cookie }));
  return { tenantId, owner, member };
}

// Un fournisseur OIDC déjà enregistré (sans passer par la découverte, qui irait sur le réseau).
async function insertProvider(ctx: TenantContext, verified: boolean) {
  const providerId = `sso-${randomBytes(6).toString('hex')}`;
  const domain = `${randomUUID().slice(0, 8)}.example.com`;
  await adminDb.insert(ssoProviders).values({
    providerId,
    domain,
    issuer: IDP,
    userId: ctx.userId,
    organizationId: ctx.tenantId,
    domainVerified: verified,
    oidcConfig: JSON.stringify({
      issuer: IDP,
      clientId: 'client',
      clientSecret: 'secret',
      authorizationEndpoint: `${IDP}/authorize`,
      tokenEndpoint: `${IDP}/token`,
      jwksEndpoint: `${IDP}/jwks`,
      tokenEndpointAuthentication: 'client_secret_basic',
      pkce: true,
    }),
  });
  return { providerId, domain };
}

const signInSso = (email: string) =>
  auth.api.signInSSO({ body: { email, callbackURL: '/' }, headers: new Headers() });

beforeEach(() => vi.mocked(requestHeaders).mockReset());

describe('SSO d’entreprise', () => {
  it('un simple membre ne règle, ne lit, ne vérifie ni ne retire le SSO', async () => {
    const { owner, member } = await workspace();
    await insertProvider(owner, false);
    const input = {
      protocol: 'saml',
      domain: 'acme.com',
      entryPoint: `${IDP}/sso`,
      metadata: '<xml/>',
    } as const;
    expect(await registerSso(member, input)).toEqual({ ok: false, error: 'refuse' });
    expect(await readSsoSetup(member)).toBeNull();
    expect(await verifySsoDomain(member)).toBe(false);
    expect(await removeSso(member)).toBe(false);
  });

  it('refuse un second SSO pour le même espace', async () => {
    const { owner } = await workspace();
    await insertProvider(owner, false);
    const input = {
      protocol: 'saml',
      domain: 'acme.com',
      entryPoint: `${IDP}/sso`,
      metadata: '<xml/>',
    } as const;
    expect(await registerSso(owner, input)).toEqual({ ok: false, error: 'deja' });
  });

  it('domaine non vérifié : aucune connexion, et l’enregistrement DNS à poser est montré', async () => {
    const { owner } = await workspace();
    const { providerId, domain } = await insertProvider(owner, false);
    await expect(signInSso(`jeanne@${domain}`)).rejects.toThrow();

    const setup = await readSsoSetup(owner);
    const name = `_leon-verification-${providerId}`;
    expect(setup).toMatchObject({ protocol: 'oidc', domain, verified: false, entityId: null });
    expect(setup?.dns?.name).toBe(`${name}.${domain}`);
    expect(setup?.dns?.value).toMatch(new RegExp(`^${name}=[A-Za-z0-9_-]{24}$`));
    expect(setup?.redirectUrl).toBe(`http://localhost:3000/api/auth/sso/callback/${providerId}`);
    // Sans l'enregistrement dans le DNS, la vérification échoue.
    expect(await verifySsoDomain(owner)).toBe(false);
  });

  it('domaine vérifié : l’adresse mène au fournisseur de l’espace', async () => {
    const { owner } = await workspace();
    const { domain } = await insertProvider(owner, true);
    const { url } = await signInSso(`jeanne@${domain}`);
    expect(url.startsWith(`${IDP}/authorize?`)).toBe(true);
    expect(await anyVerifiedSso()).toBe(true);
    expect((await readSsoSetup(owner))?.dns).toBeNull();
  });

  it('un autre espace ne voit pas ce SSO', async () => {
    const first = await workspace();
    await insertProvider(first.owner, true);
    const other = await workspace();
    expect(await readSsoSetup(other.owner)).toBeNull();
  });

  it('le propriétaire retire le SSO', async () => {
    const { owner } = await workspace();
    const { providerId } = await insertProvider(owner, true);
    expect(await removeSso(owner)).toBe(true);
    const rows = await adminDb
      .select()
      .from(ssoProviders)
      .where(and(eq(ssoProviders.providerId, providerId)));
    expect(rows).toHaveLength(0);
  });

  it('les routes HTTP du réglage et des débuts de connexion sont fermées', async () => {
    for (const path of ['/sso/register', '/sso/verify-domain', '/sign-in/sso', '/sign-in/social']) {
      const response = await auth.handler(
        new Request(`http://localhost:3000/api/auth${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
          body: '{}',
        }),
      );
      expect(response.status, path).toBe(404);
    }
  });
});
