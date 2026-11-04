import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS } from '@/capture/api-contract';
import {
  createApiToken,
  createGrant,
  generateApiToken,
  listApiTokens,
  registerApiToken,
  revokeApiToken,
} from '@/server/auth/api-tokens';
import { auth } from '@/server/auth/auth';
import { createUserWithOrganization } from '@/server/auth/sign-up';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { apiTokens } from '@/server/db/schema/api-tokens';
import { members, organizations, users } from '@/server/db/schema/auth';
import { adminDb } from '@/test/db';
import { TEST_ENV } from '@/test/test-env';
import { app } from './app';
import { type ApiEnv, apiTokenGuard, requireApiToken } from './require-api-token';

afterEach(() => vi.restoreAllMocks());

const testApp = new Hono<ApiEnv>()
  .use(requireApiToken)
  .get('/', (c) => c.json({ ctx: c.var.ctx, tokenId: c.var.tokenId }));

// La route montée avec l'option qui accepte les jetons des assistants (seul /api/mcp la passe).
const assistantApp = new Hono<ApiEnv>()
  .use(apiTokenGuard({ assistant: true }))
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
    expect(await response.json()).toEqual({ error: 'Missing or invalid token' });
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

// F9 : un jeton assistant n'ouvre que /api/mcp ; partout ailleurs, le même 401 qu'un jeton inconnu.
describe('jeton assistant', () => {
  const grantInput = () => ({
    grantId: randomUUID(),
    clientRef: 'a'.repeat(64),
    clientName: 'Claude',
    clientHost: 'claude.ai',
    name: 'Claude',
  });

  async function assistantToken(ctx: TenantContext): Promise<string> {
    const grant = await createGrant(ctx, grantInput());
    if (!grant) throw new Error('branchement non créé');
    return grant.accessToken;
  }

  it('est refusé par requireApiToken, avec la même réponse qu’un jeton inconnu', async () => {
    const token = await assistantToken(await signUp());
    const get = (bearer: string) =>
      testApp.request('/', { headers: { Authorization: `Bearer ${bearer}` } });

    const refused = await get(token);
    const unknown = await get(generateApiToken());

    expect(refused.status).toBe(401);
    expect(refused.status).toBe(unknown.status);
    expect(refused.headers.get('WWW-Authenticate')).toBe(unknown.headers.get('WWW-Authenticate'));
    expect(await refused.json()).toEqual(await unknown.json());
  });

  it('est accepté quand la route est montée avec l’option, comme les autres sortes de jetons', async () => {
    const paul = await signUp();
    const manual = (await createApiToken(paul, 'CLI')).token;
    const computerToken = generateApiToken();
    await registerApiToken(paul, 'Ordinateur : MacBook', computerToken);

    for (const token of [await assistantToken(paul), manual, computerToken]) {
      const response = await assistantApp.request('/', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(200);
      expect(((await response.json()) as { ctx: TenantContext }).ctx).toEqual(paul);
    }
  });

  it('reste refusé quand il est expiré, même sur la route qui l’accepte', async () => {
    const paul = await signUp();
    const token = await assistantToken(paul);
    await adminDb
      .update(apiTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(apiTokens.userId, paul.userId));

    const response = await assistantApp.request('/', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(401);
  });

  it.each([
    ['GET', API_PATHS.me],
    ['POST', API_PATHS.ingest],
    ['GET', `${API_PATHS.briefing}?projet=github.com/acme/projet`],
    ['POST', API_PATHS.faits],
    ['POST', API_PATHS.contexte],
    ['DELETE', API_PATHS.jeton],
  ])('%s %s répond 401 à un jeton assistant', async (method, path) => {
    const token = await assistantToken(await signUp());

    const response = await app.request(path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: method === 'GET' ? undefined : '{}',
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Missing or invalid token' });
  });

  // Un appel `initialize` à /api/mcp avec ce jeton d'accès.
  const initialize = (token: string) =>
    app.request(API_PATHS.mcp, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      }),
    });

  it('est accepté par /api/mcp', async () => {
    const token = await assistantToken(await signUp());

    expect((await initialize(token)).status).toBe(200);
  });

  // M08 : « Révoquer » dans Assistants connectés (revokeTokenAction → revokeApiToken) coupe l'assistant à l'appel suivant.
  it('est refusé par /api/mcp une fois révoqué dans Réglages', async () => {
    const paul = await signUp();
    const token = await assistantToken(paul);
    expect((await initialize(token)).status).toBe(200);

    const [row] = await listApiTokens(paul);
    expect(row).toMatchObject({ kind: 'assistant', clientName: 'Claude', clientHost: 'claude.ai' });
    expect(await revokeApiToken(paul, row?.id ?? '')).toBe(true);

    const response = await initialize(token);
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toContain('resource_metadata=');
  });

  it('est refusé par /api/mcp sans jeton', async () => {
    const response = await app.request(API_PATHS.mcp, { method: 'POST', body: '{}' });
    expect(response.status).toBe(401);
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

  // La suppression d'un compte passe par `deleteAccount` : la route de Better Auth, qui effacerait la ligne `user`
  // et emporterait le travail de la personne avec elle, reste fermée.
  it('refuse la suppression de son compte par Better Auth', async () => {
    const email = `paul-${randomUUID()}@example.com`;
    const paul = await signUp(email);

    const response = await app.request('/api/auth/delete-user', {
      method: 'POST',
      headers: { cookie: await sessionCookie(email), ...jsonFromApp },
      body: JSON.stringify({ password }),
    });

    expect(response.status).not.toBe(200);
    const rows = await adminDb
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, paul.userId));
    expect(rows).toEqual([{ id: paul.userId }]);
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
