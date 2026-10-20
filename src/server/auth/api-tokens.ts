import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, gte, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { API_TOKEN_PATTERN } from '@/capture/api-contract';
import { db } from '@/server/db/client';
import { apiTokens } from '@/server/db/schema/api-tokens';
import { members } from '@/server/db/schema/auth';
import { principalsFor, type TenantContext } from './tenant-context';

export type ApiTokenRow = {
  id: string;
  name: string;
  hint: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

const LAST_USED_PRECISION_MS = 60_000; // évite une écriture à chaque requête

export function generateApiToken(): string {
  return `leon_${randomBytes(32).toString('base64url')}`;
}

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Le jeton en clair n'est renvoyé qu'ici, une seule fois.
export async function createApiToken(
  ctx: TenantContext,
  name: string,
): Promise<{ id: string; token: string; hint: string }> {
  const token = generateApiToken();
  const hint = token.slice(-4);
  const [row] = await db
    .insert(apiTokens)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      name,
      tokenHash: hashApiToken(token),
      tokenHint: hint,
    })
    .returning({ id: apiTokens.id });
  if (!row) throw new Error('jeton non créé');
  return { id: row.id, token, hint };
}

const ownedBy = (ctx: TenantContext) =>
  and(eq(apiTokens.userId, ctx.userId), eq(apiTokens.tenantId, ctx.tenantId));

// L'adhésion en cours, depuis avant la création du jeton : celui d'une ancienne adhésion ne vaut plus rien.
const currentMembership = and(
  eq(members.userId, apiTokens.userId),
  eq(members.organizationId, apiTokens.tenantId),
  gte(apiTokens.createdAt, members.createdAt),
);

// Les jetons de l'adhésion en cours : ceux d'une ancienne adhésion, refusés par verifyApiToken, ne sont pas listés.
export async function listApiTokens(ctx: TenantContext): Promise<ApiTokenRow[]> {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      hint: apiTokens.tokenHint,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
      revokedAt: apiTokens.revokedAt,
    })
    .from(apiTokens)
    .innerJoin(members, currentMembership)
    .where(ownedBy(ctx))
    .orderBy(desc(apiTokens.createdAt), desc(apiTokens.id));
}

// Seul le propriétaire révoque son jeton ; false si le jeton n'est pas à lui ou déjà révoqué.
export async function revokeApiToken(ctx: TenantContext, tokenId: string): Promise<boolean> {
  if (!z.uuid().safeParse(tokenId).success) return false;
  const rows = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, tokenId), ownedBy(ctx), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id });
  return rows.length > 0;
}

// Jeton non révoqué dont l'utilisateur est toujours membre de l'organisation, depuis avant la création du
// jeton, revérifié à chaque appel.
export async function verifyApiToken(
  token: string,
): Promise<{ tokenId: string; ctx: TenantContext } | null> {
  if (!API_TOKEN_PATTERN.test(token)) return null;
  const [row] = await db
    .select({
      id: apiTokens.id,
      userId: apiTokens.userId,
      tenantId: apiTokens.tenantId,
      lastUsedAt: apiTokens.lastUsedAt,
    })
    .from(apiTokens)
    // Un membre retiré puis réinvité ne retrouve pas les jetons de son ancienne adhésion.
    .innerJoin(members, currentMembership)
    .where(and(eq(apiTokens.tokenHash, hashApiToken(token)), isNull(apiTokens.revokedAt)))
    .limit(1);
  if (!row) return null;

  const now = new Date();
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > LAST_USED_PRECISION_MS) {
    await db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, row.id));
  }
  const ctx = {
    tenantId: row.tenantId,
    userId: row.userId,
    principals: principalsFor(row.userId, row.tenantId),
  };
  return { tokenId: row.id, ctx };
}
