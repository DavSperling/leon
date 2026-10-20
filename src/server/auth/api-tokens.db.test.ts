import { createHash, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_TOKEN_PATTERN } from '@/capture/api-contract';
import { db } from '@/server/db/client';
import { apiTokens } from '@/server/db/schema/api-tokens';
import { members } from '@/server/db/schema/auth';
import { adminDb } from '@/test/db';
import {
  createApiToken,
  generateApiToken,
  listApiTokens,
  revokeApiToken,
  verifyApiToken,
} from './api-tokens';
import { createUserWithOrganization } from './sign-up';
import { resolveTenantContext, type TenantContext } from './tenant-context';

afterEach(() => vi.restoreAllMocks());

async function signUp(name: string): Promise<TenantContext> {
  const result = await createUserWithOrganization({
    name,
    email: `${name.toLowerCase()}-${randomUUID()}@example.com`,
    password: 'motdepasse-solide',
    organizationName: `Organisation de ${name}`,
  });
  if (!result.ok) throw new Error(`inscription refusée : ${result.error}`);
  const ctx = await resolveTenantContext(result.userId, result.tenantId);
  if (!ctx) throw new Error('contexte introuvable');
  return ctx;
}

// Paul crée l'organisation ; Marie s'inscrit puis rejoint l'organisation de Paul.
async function paulAndMarie(): Promise<{ paul: TenantContext; marie: TenantContext }> {
  const paul = await signUp('Paul');
  const own = await signUp('Marie');
  await adminDb.insert(members).values({
    organizationId: paul.tenantId,
    userId: own.userId,
    role: 'member',
    createdAt: new Date(),
  });
  const marie = await resolveTenantContext(own.userId, paul.tenantId);
  if (!marie) throw new Error('Marie hors de l’organisation');
  return { paul, marie };
}

describe('generateApiToken', () => {
  it('respecte le motif du contrat et ne se répète pas', () => {
    const token = generateApiToken();
    expect(token).toMatch(API_TOKEN_PATTERN);
    expect(generateApiToken()).not.toBe(token);
  });
});

describe('jetons personnels', () => {
  it("ne stocke que le SHA-256 du jeton et l'indice de ses 4 derniers caractères", async () => {
    const paul = await signUp('Paul');
    const created = await createApiToken(paul, 'MacBook Paul');

    expect(created.token).toMatch(API_TOKEN_PATTERN);
    expect(created.hint).toBe(created.token.slice(-4));
    const [row] = await adminDb.select().from(apiTokens).where(eq(apiTokens.id, created.id));
    expect(row?.tokenHash).toBe(createHash('sha256').update(created.token).digest('hex'));
    expect(JSON.stringify(row)).not.toContain(created.token.slice(5));
  });

  it('vérifie un jeton valide, note son usage, et refuse un jeton révoqué', async () => {
    const paul = await signUp('Paul');
    const created = await createApiToken(paul, 'CLI');

    expect(await verifyApiToken(created.token)).toEqual({ tokenId: created.id, ctx: paul });
    const [used] = await listApiTokens(paul);
    expect(used?.lastUsedAt).toBeInstanceOf(Date);

    expect(await revokeApiToken(paul, created.id)).toBe(true);
    expect(await verifyApiToken(created.token)).toBeNull();
    const [revoked] = await listApiTokens(paul);
    expect(revoked?.revokedAt).toBeInstanceOf(Date);
  });

  it('Marie ne voit ni ne révoque le jeton de Paul', async () => {
    const { paul, marie } = await paulAndMarie();
    const created = await createApiToken(paul, 'MacBook Paul');

    expect(await revokeApiToken(marie, created.id)).toBe(false);
    expect(await verifyApiToken(created.token)).not.toBeNull();
    expect((await listApiTokens(marie)).map((t) => t.id)).not.toContain(created.id);
    expect(await listApiTokens(paul)).toEqual([
      {
        id: created.id,
        name: 'MacBook Paul',
        hint: created.hint,
        createdAt: expect.any(Date),
        lastUsedAt: expect.any(Date),
        revokedAt: null,
      },
    ]);
  });

  it("refuse le jeton d'un utilisateur qui n'est plus membre de l'organisation", async () => {
    const paul = await signUp('Paul');
    const created = await createApiToken(paul, 'Extension');
    expect(await verifyApiToken(created.token)).toEqual({ tokenId: created.id, ctx: paul });

    await adminDb
      .delete(members)
      .where(and(eq(members.userId, paul.userId), eq(members.organizationId, paul.tenantId)));
    expect(await verifyApiToken(created.token)).toBeNull();
  });

  // Audit n° 12 : un membre retiré puis réinvité retrouvait les jetons de son ancienne adhésion.
  it("refuse un jeton créé avant l'adhésion en cours", async () => {
    const paul = await signUp('Paul');
    const created = await createApiToken(paul, 'Extension');
    const membership = and(
      eq(members.userId, paul.userId),
      eq(members.organizationId, paul.tenantId),
    );

    await adminDb
      .update(members)
      .set({ createdAt: new Date(Date.now() + 60_000) })
      .where(membership);

    expect(await verifyApiToken(created.token)).toBeNull();
  });

  // Audit 2 n° 15 b : la page des réglages montrait encore comme actif le jeton de l'ancienne adhésion.
  it("ne liste pas un jeton créé avant l'adhésion en cours", async () => {
    const paul = await signUp('Paul');
    await createApiToken(paul, 'Ancienne adhésion');
    await adminDb
      .update(members)
      .set({ createdAt: new Date(Date.now() + 60_000) })
      .where(and(eq(members.userId, paul.userId), eq(members.organizationId, paul.tenantId)));
    // Le jeton créé après la réadhésion, lui, reste listé.
    const current = await createApiToken(paul, 'Adhésion en cours');
    await adminDb
      .update(apiTokens)
      .set({ createdAt: new Date(Date.now() + 120_000) })
      .where(eq(apiTokens.id, current.id));

    expect((await listApiTokens(paul)).map((t) => t.id)).toEqual([current.id]);
  });

  it('refuse un jeton mal formé sans interroger la base', async () => {
    const select = vi.spyOn(db, 'select');
    expect(await verifyApiToken('leon_court')).toBeNull();
    expect(await verifyApiToken(`${generateApiToken()} `)).toBeNull();
    expect(select).not.toHaveBeenCalled();
  });

  it("renvoie false pour un id de jeton qui n'est pas un UUID", async () => {
    const paul = await signUp('Paul');
    expect(await revokeApiToken(paul, 'pas-un-uuid')).toBe(false);
  });
});
