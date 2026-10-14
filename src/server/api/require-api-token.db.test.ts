import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiToken } from '@/server/auth/api-tokens';
import { auth } from '@/server/auth/auth';
import { createUserWithOrganization } from '@/server/auth/sign-up';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { members, organizations } from '@/server/db/schema/auth';
import { adminDb } from '@/test/db';
import { TEST_ENV } from '@/test/test-env';
import { app } from './app';
import { type ApiEnv, requireApiToken } from './require-api-token';

afterEach(() => vi.restoreAllMocks());

const testApp = new Hono<ApiEnv>()
  .use(requireApiToken)
  .get('/', (c) => c.json({ ctx: c.var.ctx, tokenId: c.var.tokenId }));

const password = 'motdepasse-solide';

async function signUp(email = `paul-${randomUUID()}@example.com`): Promise<TenantContext> {
  const result = await createUserWithOrganization({
    name: 'Paul',
    email,
    password,
    organizationName: 'Organisation de Paul',
  });
  if (!result.ok) throw new Error(`inscription refusée : ${result.error}`);
  const ctx = await resolveTenantContext(result.userId, result.tenantId);
  if (!ctx) throw new Error('contexte introuvable');
  return ctx;
}

// Espionne console.* : aucun appel ne doit contenir le jeton.
function spyConsole() {
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const spies = methods.map((method) => vi.spyOn(console, method));
  return () => spies.flatMap((spy) => spy.mock.calls).map((args) => JSON.stringify(args));
}

describe('requireApiToken', () => {
  it("répond 401 avec WWW-Authenticate sans en-tête d'autorisation", async () => {
    const response = await testApp.request('/');
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
    expect(await response.json()).toEqual({ error: 'Jeton manquant ou invalide' });
  });

  it('répond 401 à un jeton mal formé', async () => {
    const response = await testApp.request('/', { headers: { Authorization: 'Bearer abc' } });
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  it('répond 401 à un jeton bien formé mais inconnu, sans le journaliser', async () => {
    const calls = spyConsole();
    const token = `leon_${'a'.repeat(43)}`;
    const response = await testApp.request('/', { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(401);
    expect(calls().join('\n')).not.toContain(token.slice(5));
  });

  it('renseigne le contexte avec un jeton valide, sans le journaliser', async () => {
    const paul = await signUp();
    const { id, token } = await createApiToken(paul, 'CLI');
    const calls = spyConsole();

    const response = await testApp.request('/', { headers: { Authorization: `Bearer ${token}` } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ctx: paul, tokenId: id });
    expect(calls().join('\n')).not.toContain(token.slice(5));
  });
});

describe('montage de Better Auth', () => {
  it('répond sur /api/auth/ok', async () => {
    const response = await app.request('/api/auth/ok');
    expect(response.status).toBe(200);
  });

  it("refuse la suppression d'une organisation, même à son propriétaire", async () => {
    const email = `paul-${randomUUID()}@example.com`;
    const paul = await signUp(email);
    const { headers } = await auth.api.signInEmail({
      body: { email, password },
      returnHeaders: true,
    });
    const cookie = headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(cookie).toMatch(/^better-auth\.session_token=/);

    const response = await app.request('/api/auth/organization/delete', {
      method: 'POST',
      headers: { cookie, origin: TEST_ENV.BETTER_AUTH_URL, 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: paul.tenantId }),
    });

    expect(response.status).not.toBe(200);
    const rows = await adminDb
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, paul.tenantId));
    expect(rows).toEqual([{ id: paul.tenantId }]);
  });

  // Aucun e-mail n'est vérifié dans ce jet : quiconque s'inscrit avec l'adresse invitée ne doit pas
  // pouvoir rejoindre l'organisation, même en connaissant l'identifiant de l'invitation.
  it("refuse d'accepter une invitation avec un e-mail non vérifié", async () => {
    const paulEmail = `paul-${randomUUID()}@example.com`;
    const paul = await signUp(paulEmail);
    const invitedEmail = `marie-${randomUUID()}@example.com`;
    const invite = await app.request('/api/auth/organization/invite-member', {
      method: 'POST',
      headers: { cookie: await sessionCookie(paulEmail), ...jsonFromApp },
      body: JSON.stringify({ email: invitedEmail, role: 'member', organizationId: paul.tenantId }),
    });
    expect(invite.status).toBe(200);
    const { id: invitationId } = (await invite.json()) as { id: string };

    const attacker = await signUp(invitedEmail);
    const response = await app.request('/api/auth/organization/accept-invitation', {
      method: 'POST',
      headers: { cookie: await sessionCookie(invitedEmail), ...jsonFromApp },
      body: JSON.stringify({ invitationId }),
    });

    expect(response.status).not.toBe(200);
    const membership = await adminDb
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.userId, attacker.userId), eq(members.organizationId, paul.tenantId)));
    expect(membership).toEqual([]);
  });
});

const jsonFromApp = { origin: TEST_ENV.BETTER_AUTH_URL, 'content-type': 'application/json' };

async function sessionCookie(email: string): Promise<string> {
  const { headers } = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  return headers.get('set-cookie')?.split(';')[0] ?? '';
}
