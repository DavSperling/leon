import { createHash, randomUUID } from 'node:crypto';
import { and, count, eq, sql } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_TOKEN_PATTERN } from '@/capture/api-contract';
import { db } from '@/server/db/client';
import { apiTokens } from '@/server/db/schema/api-tokens';
import { members, users } from '@/server/db/schema/auth';
import { adminDb } from '@/test/db';
import {
  createApiToken,
  createGrant,
  generateApiToken,
  listApiTokens,
  refreshGrant,
  registerApiToken,
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
  it("est un jeton manuel, sans expiration ni renouvellement, qui n'expire jamais", async () => {
    const paul = await signUp('Paul');
    const created = await createApiToken(paul, 'CLI');

    const [row] = await adminDb.select().from(apiTokens).where(eq(apiTokens.id, created.id));
    expect(row).toMatchObject({
      kind: 'manuel',
      clientName: null,
      clientHost: null,
      clientRef: null,
      grantId: null,
      expiresAt: null,
      refreshHash: null,
      refreshExpiresAt: null,
    });
  });

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

    expect(await verifyApiToken(created.token)).toEqual({
      tokenId: created.id,
      ctx: paul,
      kind: 'manuel',
    });
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
        kind: 'manuel',
        clientName: null,
        clientHost: null,
        refreshExpiresAt: null,
      },
    ]);
  });

  it("refuse le jeton d'un utilisateur qui n'est plus membre de l'organisation", async () => {
    const paul = await signUp('Paul');
    const created = await createApiToken(paul, 'Extension');
    expect(await verifyApiToken(created.token)).toEqual({
      tokenId: created.id,
      ctx: paul,
      kind: 'manuel',
    });

    await adminDb
      .delete(members)
      .where(and(eq(members.userId, paul.userId), eq(members.organizationId, paul.tenantId)));
    expect(await verifyApiToken(created.token)).toBeNull();
  });

  // Un jeton créé pendant la suppression du compte peut échapper à la révocation : l'ancien membre ne passe plus.
  it("refuse un jeton non révoqué d'un ancien membre, et ne le liste plus", async () => {
    const paul = await signUp('Paul');
    const created = await createApiToken(paul, 'Extension');
    expect(await verifyApiToken(created.token)).not.toBeNull();

    await adminDb.update(users).set({ deletedAt: new Date() }).where(eq(users.id, paul.userId));

    expect(await verifyApiToken(created.token)).toBeNull();
    expect(await listApiTokens(paul)).toEqual([]);
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

  // L'adhésion prend son heure côté Node, le jeton côté base : un jeton créé juste après l'adhésion peut porter
  // une heure un peu plus ancienne. Il reste valide.
  it("accepte un jeton créé dans la seconde de l'adhésion, malgré l'écart d'horloge", async () => {
    const paul = await signUp('Paul');
    const created = await createApiToken(paul, 'Extension');
    await adminDb
      .update(members)
      .set({
        createdAt: sql`(select created_at from api_tokens where id = ${created.id}) + interval '300 milliseconds'`,
      })
      .where(and(eq(members.userId, paul.userId), eq(members.organizationId, paul.tenantId)));

    expect(await verifyApiToken(created.token)).not.toBeNull();
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

// Le jeton naît sur l'ordinateur de l'utilisateur (leon login) : le serveur n'enregistre que celui qu'on lui présente.
describe('registerApiToken', () => {
  it('enregistre le jeton reçu : nom et indice gardés, seul son SHA-256 en base, et il passe verifyApiToken', async () => {
    const paul = await signUp('Paul');
    const token = generateApiToken();

    const registered = await registerApiToken(paul, 'Ordinateur : MacBook Paul', token);

    expect(registered).toEqual({ id: expect.any(String) });
    const [row] = await adminDb
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.id, registered?.id ?? ''));
    expect(row).toMatchObject({
      tenantId: paul.tenantId,
      userId: paul.userId,
      name: 'Ordinateur : MacBook Paul',
      tokenHash: createHash('sha256').update(token).digest('hex'),
      tokenHint: token.slice(-4),
      revokedAt: null,
      kind: 'ordinateur',
      expiresAt: null,
      refreshHash: null,
    });
    expect(JSON.stringify(row)).not.toContain(token.slice(5));
    expect(await verifyApiToken(token)).toEqual({
      tokenId: registered?.id,
      ctx: paul,
      kind: 'ordinateur',
    });
  });

  it('ne renvoie jamais le jeton', async () => {
    const paul = await signUp('Paul');
    const token = generateApiToken();

    const registered = await registerApiToken(paul, 'Ordinateur : MacBook Paul', token);

    expect(Object.keys(registered ?? {})).toEqual(['id']);
    expect(JSON.stringify(registered)).not.toContain(token);
  });

  it('rend null, sans lever ni rien ajouter, quand le jeton est déjà en base', async () => {
    const { paul, marie } = await paulAndMarie();
    const token = generateApiToken();
    const first = await registerApiToken(paul, 'Ordinateur : MacBook Paul', token);
    expect(first).not.toBeNull();
    // Marie est dans l'organisation de Paul : toutes les lignes possibles de l'essai y sont.
    const total = async () =>
      (
        await adminDb
          .select({ n: count() })
          .from(apiTokens)
          .where(eq(apiTokens.tenantId, paul.tenantId))
      )[0]?.n;
    const before = await total();

    // Même utilisateur, ou autre membre de l'organisation : le jeton appartient à celui qui l'a enregistré.
    expect(await registerApiToken(paul, 'Ordinateur : autre nom', token)).toBeNull();
    expect(await registerApiToken(marie, 'Ordinateur : MacBook Marie', token)).toBeNull();

    expect(await total()).toBe(before);
    expect(await verifyApiToken(token)).toEqual({
      tokenId: first?.id,
      ctx: paul,
      kind: 'ordinateur',
    });
  });

  it('rend null aussi pour un jeton que createApiToken a déjà créé', async () => {
    const paul = await signUp('Paul');
    const created = await createApiToken(paul, 'Extension');

    expect(await registerApiToken(paul, 'Ordinateur : MacBook Paul', created.token)).toBeNull();
  });

  it('refuse un jeton mal formé, sans rien écrire ni recopier le jeton dans l’erreur', async () => {
    const paul = await signUp('Paul');
    const insert = vi.spyOn(db, 'insert');
    const valid = generateApiToken();

    for (const bad of [
      '',
      'leon_court',
      `${valid} `,
      `${valid}x`,
      valid.replace('leon_', 'autre_'),
    ]) {
      const error = await registerApiToken(paul, 'Ordinateur : MacBook Paul', bad).catch((e) => e);
      expect(error).toBeInstanceOf(Error);
      if (bad) expect(String(error.message)).not.toContain(bad);
    }

    expect(insert).not.toHaveBeenCalled();
  });
});

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

let grantCount = 0;
const newGrant = (overrides: Partial<Parameters<typeof createGrant>[1]> = {}) => ({
  grantId: `grant-${randomUUID()}-${grantCount++}`,
  clientRef: sha256('https://claude.ai/oauth/client.json'),
  clientName: 'Claude',
  clientHost: 'claude.ai',
  name: 'Claude',
  ...overrides,
});

async function grantRow(grantId: string) {
  const [row] = await adminDb.select().from(apiTokens).where(eq(apiTokens.grantId, grantId));
  if (!row) throw new Error('ligne introuvable');
  return row;
}

// Les jetons des assistants branchés par OAuth (claude.ai, ChatGPT…) : accès d'une heure, renouvellement de 90 jours
// changé à chaque usage.
describe('createGrant', () => {
  it('insère la ligne de l’assistant et rend ses deux jetons en clair, dont seules les empreintes sont en base', async () => {
    const paul = await signUp('Paul');
    const input = newGrant();
    const before = Date.now();

    const grant = await createGrant(paul, input);

    expect(grant?.accessToken).toMatch(API_TOKEN_PATTERN);
    expect(grant?.refreshToken).toMatch(API_TOKEN_PATTERN);
    expect(grant?.accessToken).not.toBe(grant?.refreshToken);
    const row = await grantRow(input.grantId);
    expect(row).toMatchObject({
      tenantId: paul.tenantId,
      userId: paul.userId,
      kind: 'assistant',
      name: 'Claude',
      clientName: 'Claude',
      clientHost: 'claude.ai',
      clientRef: input.clientRef,
      grantId: input.grantId,
      tokenHash: sha256(grant?.accessToken ?? ''),
      tokenHint: grant?.accessToken.slice(-4),
      refreshHash: sha256(grant?.refreshToken ?? ''),
      revokedAt: null,
    });
    expect(row.expiresAt?.getTime()).toBeGreaterThanOrEqual(before + HOUR_MS);
    expect(row.expiresAt?.getTime()).toBeLessThanOrEqual(Date.now() + HOUR_MS);
    expect(row.refreshExpiresAt?.getTime()).toBeGreaterThanOrEqual(before + 90 * DAY_MS);
    expect(row.refreshExpiresAt?.getTime()).toBeLessThanOrEqual(Date.now() + 90 * DAY_MS);
    expect(JSON.stringify(row)).not.toContain(grant?.accessToken.slice(5));
    expect(JSON.stringify(row)).not.toContain(grant?.refreshToken.slice(5));
  });

  it('donne un jeton d’accès qui ouvre le contexte de l’utilisateur, de kind assistant', async () => {
    const paul = await signUp('Paul');
    const grant = await createGrant(paul, newGrant());

    const verified = await verifyApiToken(grant?.accessToken ?? '');

    expect(verified).toEqual({ tokenId: expect.any(String), ctx: paul, kind: 'assistant' });
    // Le jeton de renouvellement n'ouvre rien : il n'est pas un jeton d'accès.
    expect(await verifyApiToken(grant?.refreshToken ?? '')).toBeNull();
  });

  it('se liste avec son kind, le nom et l’hôte du client', async () => {
    const paul = await signUp('Paul');
    await createGrant(paul, newGrant({ clientName: 'Claude', clientHost: 'claude.ai' }));

    expect(await listApiTokens(paul)).toEqual([
      expect.objectContaining({
        kind: 'assistant',
        clientName: 'Claude',
        clientHost: 'claude.ai',
        refreshExpiresAt: expect.any(Date), // la page ne montre que les assistants qui peuvent encore se renouveler
      }),
    ]);
  });

  // Un code d'autorisation servi deux fois : la seconde fois révoque ce que la première a donné (RFC 6749 §4.1.2).
  it('révoque la ligne existante et rend null, sans lever, quand le grant_id existe déjà', async () => {
    const paul = await signUp('Paul');
    const input = newGrant();
    const first = await createGrant(paul, input);
    expect(await verifyApiToken(first?.accessToken ?? '')).not.toBeNull();
    const total = async () =>
      (
        await adminDb
          .select({ n: count() })
          .from(apiTokens)
          .where(eq(apiTokens.grantId, input.grantId))
      )[0]?.n;

    expect(await createGrant(paul, input)).toBeNull();

    expect(await total()).toBe(1);
    expect((await grantRow(input.grantId)).revokedAt).toBeInstanceOf(Date);
    expect(await verifyApiToken(first?.accessToken ?? '')).toBeNull();
    expect(await refreshGrant(first?.refreshToken ?? '', input.clientRef)).toBeNull();
  });
});

describe('verifyApiToken et l’expiration', () => {
  it('refuse un jeton d’accès dont expires_at est passé, et accepte celui qui n’est pas échu', async () => {
    const paul = await signUp('Paul');
    const input = newGrant();
    const grant = await createGrant(paul, input);
    expect(await verifyApiToken(grant?.accessToken ?? '')).not.toBeNull();

    await adminDb
      .update(apiTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(apiTokens.grantId, input.grantId));
    expect(await verifyApiToken(grant?.accessToken ?? '')).toBeNull();

    await adminDb
      .update(apiTokens)
      .set({ expiresAt: new Date(Date.now() + 60_000) })
      .where(eq(apiTokens.grantId, input.grantId));
    expect(await verifyApiToken(grant?.accessToken ?? '')).not.toBeNull();
  });

  it('refuse toujours un jeton d’assistant révoqué ou d’un membre retiré', async () => {
    const paul = await signUp('Paul');
    const input = newGrant();
    const grant = await createGrant(paul, input);

    await adminDb
      .delete(members)
      .where(and(eq(members.userId, paul.userId), eq(members.organizationId, paul.tenantId)));
    expect(await verifyApiToken(grant?.accessToken ?? '')).toBeNull();

    const other = await signUp('Marie');
    const second = await createGrant(other, newGrant());
    expect(await verifyApiToken(second?.accessToken ?? '')).not.toBeNull();
    const [row] = await listApiTokens(other);
    await revokeApiToken(other, row?.id ?? '');
    expect(await verifyApiToken(second?.accessToken ?? '')).toBeNull();
  });
});

describe('refreshGrant', () => {
  async function granted() {
    const paul = await signUp('Paul');
    const input = newGrant();
    const grant = await createGrant(paul, input);
    if (!grant) throw new Error('branchement non créé');
    return { paul, input, grant };
  }

  it('change les deux jetons et les deux expirations sur la même ligne ; l’ancien accès et l’ancien renouvellement ne valent plus', async () => {
    const { paul, input, grant } = await granted();
    // Les expirations d'origine sont reculées : le renouvellement les reporte.
    await adminDb
      .update(apiTokens)
      .set({
        expiresAt: new Date(Date.now() - 1000),
        refreshExpiresAt: new Date(Date.now() + DAY_MS),
      })
      .where(eq(apiTokens.grantId, input.grantId));
    const before = await grantRow(input.grantId);
    const started = Date.now();

    const renewed = await refreshGrant(grant.refreshToken, input.clientRef);

    expect(renewed?.accessToken).toMatch(API_TOKEN_PATTERN);
    expect(renewed?.refreshToken).toMatch(API_TOKEN_PATTERN);
    expect(renewed?.accessToken).not.toBe(grant.accessToken);
    expect(renewed?.refreshToken).not.toBe(grant.refreshToken);
    const row = await grantRow(input.grantId);
    expect(row.id).toBe(before.id);
    expect(row).toMatchObject({
      kind: 'assistant',
      tokenHash: sha256(renewed?.accessToken ?? ''),
      tokenHint: renewed?.accessToken.slice(-4),
      refreshHash: sha256(renewed?.refreshToken ?? ''),
      revokedAt: null,
    });
    expect(row.expiresAt?.getTime()).toBeGreaterThanOrEqual(started + HOUR_MS);
    expect(row.refreshExpiresAt?.getTime()).toBeGreaterThanOrEqual(started + 90 * DAY_MS);
    expect(JSON.stringify(row)).not.toContain(renewed?.accessToken.slice(5));
    expect(JSON.stringify(row)).not.toContain(renewed?.refreshToken.slice(5));

    expect(await verifyApiToken(grant.accessToken)).toBeNull();
    expect(await refreshGrant(grant.refreshToken, input.clientRef)).toBeNull();
    expect(await verifyApiToken(renewed?.accessToken ?? '')).toEqual({
      tokenId: before.id,
      ctx: paul,
      kind: 'assistant',
    });
    // Le nouveau renouvellement sert à son tour.
    expect(await refreshGrant(renewed?.refreshToken ?? '', input.clientRef)).not.toBeNull();
  });

  it('ne renouvelle qu’une fois quand deux appels arrivent en même temps', async () => {
    const { input, grant } = await granted();

    const results = await Promise.all([
      refreshGrant(grant.refreshToken, input.clientRef),
      refreshGrant(grant.refreshToken, input.clientRef),
    ]);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
  });

  it('rend null pour une ligne révoquée', async () => {
    const { paul, input, grant } = await granted();
    const [row] = await listApiTokens(paul);
    expect(await revokeApiToken(paul, row?.id ?? '')).toBe(true);

    expect(await refreshGrant(grant.refreshToken, input.clientRef)).toBeNull();
  });

  it('rend null quand le renouvellement a expiré', async () => {
    const { input, grant } = await granted();
    await adminDb
      .update(apiTokens)
      .set({ refreshExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(apiTokens.grantId, input.grantId));

    expect(await refreshGrant(grant.refreshToken, input.clientRef)).toBeNull();
  });

  it('rend null pour un autre client_id, même du même hôte, et ne change rien', async () => {
    const { paul, input, grant } = await granted();
    const before = await grantRow(input.grantId);

    expect(
      await refreshGrant(grant.refreshToken, sha256('https://claude.ai/autre-client')),
    ).toBeNull();

    expect(await grantRow(input.grantId)).toEqual(before);
    expect(await verifyApiToken(grant.accessToken)).toEqual({
      tokenId: before.id,
      ctx: paul,
      kind: 'assistant',
    });
    // Le bon client, lui, renouvelle encore.
    expect(await refreshGrant(grant.refreshToken, input.clientRef)).not.toBeNull();
  });

  it('rend null pour un membre retiré de l’organisation', async () => {
    const { paul, input, grant } = await granted();
    await adminDb
      .delete(members)
      .where(and(eq(members.userId, paul.userId), eq(members.organizationId, paul.tenantId)));

    expect(await refreshGrant(grant.refreshToken, input.clientRef)).toBeNull();
  });

  it('rend null pour une adhésion refaite après le branchement', async () => {
    const { paul, input, grant } = await granted();
    await adminDb
      .update(members)
      .set({ createdAt: new Date(Date.now() + 60_000) })
      .where(and(eq(members.userId, paul.userId), eq(members.organizationId, paul.tenantId)));

    expect(await refreshGrant(grant.refreshToken, input.clientRef)).toBeNull();
  });

  it('rend null pour un compte supprimé', async () => {
    const { paul, input, grant } = await granted();
    await adminDb.update(users).set({ deletedAt: new Date() }).where(eq(users.id, paul.userId));

    expect(await refreshGrant(grant.refreshToken, input.clientRef)).toBeNull();
  });

  it('rend null pour un jeton inconnu ou pour un jeton d’accès', async () => {
    const { input, grant } = await granted();

    expect(await refreshGrant(generateApiToken(), input.clientRef)).toBeNull();
    expect(await refreshGrant(grant.accessToken, input.clientRef)).toBeNull();
  });

  it('rend null pour un jeton mal formé, sans interroger la base', async () => {
    const update = vi.spyOn(db, 'update');

    expect(await refreshGrant('leon_court', 'ref')).toBeNull();
    expect(await refreshGrant('', 'ref')).toBeNull();
    expect(await refreshGrant(`${generateApiToken()} `, 'ref')).toBeNull();

    expect(update).not.toHaveBeenCalled();
  });

  // RFC 9700 §4.14.2 : un jeton de renouvellement déjà changé qu'on présente encore trahit une copie volée. Le client
  // légitime qui renouvelle deux fois en même temps, lui, se rejoue lui-même : 30 s de tolérance.
  describe('rejeu d’un jeton de renouvellement', () => {
    // `grant.refreshToken` est l'ancien jeton ; `renewed.refreshToken`, le courant.
    async function renewedOnce() {
      const { paul, input, grant } = await granted();
      const renewed = await refreshGrant(grant.refreshToken, input.clientRef);
      if (!renewed) throw new Error('renouvellement refusé');
      return { paul, input, grant, renewed };
    }
    const rotatedAgo = (grantId: string, ms: number) =>
      adminDb
        .update(apiTokens)
        .set({ refreshRotatedAt: new Date(Date.now() - ms) })
        .where(eq(apiTokens.grantId, grantId));

    it('garde l’ancienne empreinte et l’heure de la rotation ; un branchement neuf n’en a pas', async () => {
      const { input, grant } = await granted();
      expect(await grantRow(input.grantId)).toMatchObject({
        previousRefreshHash: null,
        refreshRotatedAt: null,
      });
      const started = Date.now();

      await refreshGrant(grant.refreshToken, input.clientRef);

      const row = await grantRow(input.grantId);
      expect(row.previousRefreshHash).toBe(sha256(grant.refreshToken));
      expect(row.refreshRotatedAt?.getTime()).toBeGreaterThanOrEqual(started);
      expect(row.refreshRotatedAt?.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('au-delà de 30 s, révoque la ligne : l’accès en cours et le renouvellement courant ne valent plus', async () => {
      const { paul, input, grant, renewed } = await renewedOnce();
      expect(await verifyApiToken(renewed.accessToken)).not.toBeNull();
      await rotatedAgo(input.grantId, 31_000);

      expect(await refreshGrant(grant.refreshToken, input.clientRef)).toBeNull();

      const row = await grantRow(input.grantId);
      expect(row.revokedAt).toBeInstanceOf(Date);
      expect(await verifyApiToken(renewed.accessToken)).toBeNull();
      expect(await refreshGrant(renewed.refreshToken, input.clientRef)).toBeNull();
      expect((await listApiTokens(paul))[0]?.revokedAt).toBeInstanceOf(Date);
      // Un second rejeu ne déplace pas l'heure de la révocation.
      expect(await refreshGrant(grant.refreshToken, input.clientRef)).toBeNull();
      expect((await grantRow(input.grantId)).revokedAt).toEqual(row.revokedAt);
    });

    it('dans les 30 s, rend null sans rien changer : le nouveau jeton marche', async () => {
      const { paul, input, grant, renewed } = await renewedOnce();
      await rotatedAgo(input.grantId, 10_000);
      const before = await grantRow(input.grantId);

      expect(await refreshGrant(grant.refreshToken, input.clientRef)).toBeNull();

      expect(await grantRow(input.grantId)).toEqual(before);
      expect(await verifyApiToken(renewed.accessToken)).toEqual({
        tokenId: before.id,
        ctx: paul,
        kind: 'assistant',
      });
      expect(await refreshGrant(renewed.refreshToken, input.clientRef)).not.toBeNull();
    });

    it('un autre client_ref qui présente l’ancienne empreinte ne révoque rien', async () => {
      const { input, grant, renewed } = await renewedOnce();
      await rotatedAgo(input.grantId, 31_000);
      const before = await grantRow(input.grantId);

      expect(
        await refreshGrant(grant.refreshToken, sha256('https://claude.ai/autre-client')),
      ).toBeNull();

      expect(await grantRow(input.grantId)).toEqual(before);
      expect(await verifyApiToken(renewed.accessToken)).not.toBeNull();
    });

    it('ne révoque pas une ligne que le renouvellement a déjà passée plus loin : seule l’ancienne empreinte compte', async () => {
      const { input, grant, renewed } = await renewedOnce();
      const second = await refreshGrant(renewed.refreshToken, input.clientRef);
      expect(second).not.toBeNull();
      await rotatedAgo(input.grantId, 31_000);

      // grant.refreshToken date d'avant la dernière rotation : il n'est plus l'« ancienne empreinte ».
      expect(await refreshGrant(grant.refreshToken, input.clientRef)).toBeNull();

      expect((await grantRow(input.grantId)).revokedAt).toBeNull();
      expect(await verifyApiToken(second?.accessToken ?? '')).not.toBeNull();
    });

    it('cinq renouvellements en même temps avec le même jeton : un seul passe, la ligne reste vivante', async () => {
      const { paul, input, grant } = await granted();

      const results = await Promise.all(
        Array.from({ length: 5 }, () => refreshGrant(grant.refreshToken, input.clientRef)),
      );

      const winners = results.filter((result) => result !== null);
      expect(winners).toHaveLength(1);
      const row = await grantRow(input.grantId);
      expect(row.revokedAt).toBeNull();
      expect(await verifyApiToken(winners[0]?.accessToken ?? '')).toEqual({
        tokenId: row.id,
        ctx: paul,
        kind: 'assistant',
      });
    });

    it('cinq rejeux en même temps après 30 s : tous null, la ligne est révoquée', async () => {
      const { input, grant, renewed } = await renewedOnce();
      await rotatedAgo(input.grantId, 31_000);

      const results = await Promise.all(
        Array.from({ length: 5 }, () => refreshGrant(grant.refreshToken, input.clientRef)),
      );

      expect(results).toEqual([null, null, null, null, null]);
      expect((await grantRow(input.grantId)).revokedAt).toBeInstanceOf(Date);
      expect(await verifyApiToken(renewed.accessToken)).toBeNull();
    });

    it('un rejeu et un renouvellement légitime en même temps : jamais deux jetons vivants et révoqués à la fois', async () => {
      const { input, grant, renewed } = await renewedOnce();
      await rotatedAgo(input.grantId, 31_000);

      const [replay, legitimate] = await Promise.all([
        refreshGrant(grant.refreshToken, input.clientRef),
        refreshGrant(renewed.refreshToken, input.clientRef),
      ]);

      expect(replay).toBeNull();
      const row = await grantRow(input.grantId);
      if (legitimate) {
        // Le renouvellement est passé avant : l'ancienne empreinte a changé, le rejeu ne trouve plus rien.
        expect(row.revokedAt).toBeNull();
        expect(await verifyApiToken(legitimate.accessToken)).not.toBeNull();
      } else {
        // Le rejeu est passé avant : la ligne est révoquée, et le renouvellement qui suivait n'a rien donné.
        expect(row.revokedAt).toBeInstanceOf(Date);
        expect(await verifyApiToken(renewed.accessToken)).toBeNull();
      }
    });
  });

  it('ne touche pas aux jetons manuels ni à ceux des ordinateurs', async () => {
    const paul = await signUp('Paul');
    const manual = await createApiToken(paul, 'CLI');

    expect(await refreshGrant(manual.token, sha256('x'))).toBeNull();
    expect(await verifyApiToken(manual.token)).not.toBeNull();
  });
});
