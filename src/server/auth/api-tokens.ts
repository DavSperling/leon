import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, exists, gt, gte, isNotNull, isNull, notExists, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { API_TOKEN_PATTERN } from '@/capture/api-contract';
import { db } from '@/server/db/client';
import { apiTokens } from '@/server/db/schema/api-tokens';
import { members, users } from '@/server/db/schema/auth';
import { principalsFor, type TenantContext } from './tenant-context';

export type ApiTokenRow = {
  id: string;
  name: string;
  hint: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  kind: ApiTokenKind;
  clientName: string | null;
  clientHost: string | null;
};

type ApiTokenKind = (typeof apiTokens.$inferSelect)['kind'];

const LAST_USED_PRECISION_MS = 60_000; // évite une écriture à chaque requête
// Les jetons des assistants : accès d'une heure (exporté : `expires_in` de la route des jetons), renouvellement de
// 90 jours (reporté, et changé, à chaque usage).
export const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// Le nom des jetons que la CLI se crée en connectant un ordinateur (`POST /api/v1/ordinateurs`, K5) : Réglages les
// range dans « Ordinateurs connectés » plutôt que dans les jetons personnels.
// shortcut: reconnus au préfixe du nom (un jeton manuel nommé « Ordinateur : x » s'y range), une colonne kind dans
// api_tokens le jour où ça gêne.
export const COMPUTER_TOKEN_PREFIX = 'Ordinateur : ';
export const isComputerToken = ({ name }: { name: string }): boolean =>
  name.startsWith(COMPUTER_TOKEN_PREFIX);

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

// Le jeton naît sur l'ordinateur de l'utilisateur (leon login) : on n'enregistre ici que celui qu'on nous présente,
// et il n'est jamais renvoyé. null si ce jeton est déjà en base : l'unicité de token_hash fait l'usage unique du
// code d'autorisation. ON CONFLICT plutôt qu'un 23505 rattrapé, qui abandonnerait une transaction en cours.
export async function registerApiToken(
  ctx: TenantContext,
  name: string,
  token: string,
): Promise<{ id: string } | null> {
  // Le message ne recopie rien du jeton.
  if (!API_TOKEN_PATTERN.test(token)) throw new Error('jeton mal formé');
  const [row] = await db
    .insert(apiTokens)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      name,
      tokenHash: hashApiToken(token),
      tokenHint: token.slice(-4),
      kind: 'ordinateur',
    })
    .onConflictDoNothing({ target: apiTokens.tokenHash })
    .returning({ id: apiTokens.id });
  return row ?? null;
}

const ownedBy = (ctx: TenantContext) =>
  and(eq(apiTokens.userId, ctx.userId), eq(apiTokens.tenantId, ctx.tenantId));

// L'adhésion en cours, depuis avant la création du jeton : celui d'une ancienne adhésion ne vaut plus rien. Un
// ancien membre (compte supprimé) garde son adhésion, mais ses jetons, même non révoqués, ne valent plus rien.
const currentMembership = and(
  eq(members.userId, apiTokens.userId),
  eq(members.organizationId, apiTokens.tenantId),
  // Une seconde de marge : l'adhésion prend son heure côté Node, le jeton côté base (écart d'horloge).
  gte(apiTokens.createdAt, sql`${members.createdAt} - interval '1 second'`),
  notExists(
    db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, members.userId), isNotNull(users.deletedAt))),
  ),
);

// L'assistant que l'utilisateur vient d'autoriser (le code d'autorisation vient d'être échangé) : la ligne naît avec
// son jeton d'accès et son jeton de renouvellement, rendus en clair ici et nulle part ailleurs. null si ce grant_id
// existe déjà : le code a été servi deux fois, la ligne du premier échange est révoquée (RFC 6749 §4.1.2). ON
// CONFLICT plutôt qu'un 23505 rattrapé, qui abandonnerait une transaction en cours.
export async function createGrant(
  ctx: TenantContext,
  input: {
    grantId: string;
    clientRef: string;
    clientName: string;
    clientHost: string;
    name: string;
  },
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const accessToken = generateApiToken();
  const refreshToken = generateApiToken();
  const now = Date.now();
  const [row] = await db
    .insert(apiTokens)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      name: input.name,
      tokenHash: hashApiToken(accessToken),
      tokenHint: accessToken.slice(-4),
      kind: 'assistant',
      clientName: input.clientName,
      clientHost: input.clientHost,
      clientRef: input.clientRef,
      grantId: input.grantId,
      expiresAt: new Date(now + ACCESS_TTL_MS),
      refreshHash: hashApiToken(refreshToken),
      refreshExpiresAt: new Date(now + REFRESH_TTL_MS),
    })
    .onConflictDoNothing({ target: apiTokens.grantId })
    .returning({ id: apiTokens.id });
  if (row) return { accessToken, refreshToken };
  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.grantId, input.grantId), isNull(apiTokens.revokedAt)));
  return null;
}

// Un renouvellement change les deux jetons : l'ancien accès et l'ancien renouvellement ne valent plus. Une seule
// requête, dont le where tient lieu de compare-and-swap : de deux renouvellements en même temps, le second ne trouve
// plus l'empreinte qu'il présente. Même adhésion que verifyApiToken ; le jeton doit n'avoir pas été révoqué, ni son
// renouvellement échu, et le client doit être celui qui l'a reçu (RFC 6749 §6).
// shortcut: pas de tolérance en v1 ; garder l'ancienne empreinte de renouvellement 30 s si M07 ou l'usage montre des
// reconnexions.
export async function refreshGrant(
  refreshToken: string,
  clientRef: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  if (!API_TOKEN_PATTERN.test(refreshToken)) return null;
  const accessToken = generateApiToken();
  const next = generateApiToken();
  const now = Date.now();
  const [row] = await db
    .update(apiTokens)
    .set({
      tokenHash: hashApiToken(accessToken),
      tokenHint: accessToken.slice(-4),
      expiresAt: new Date(now + ACCESS_TTL_MS),
      refreshHash: hashApiToken(next),
      refreshExpiresAt: new Date(now + REFRESH_TTL_MS),
    })
    .where(
      and(
        eq(apiTokens.refreshHash, hashApiToken(refreshToken)),
        eq(apiTokens.clientRef, clientRef),
        isNull(apiTokens.revokedAt),
        gt(apiTokens.refreshExpiresAt, new Date(now)),
        exists(db.select({ one: sql`1` }).from(members).where(currentMembership)),
      ),
    )
    .returning({ id: apiTokens.id });
  return row ? { accessToken, refreshToken: next } : null;
}

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
      kind: apiTokens.kind,
      clientName: apiTokens.clientName,
      clientHost: apiTokens.clientHost,
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

// Jeton non révoqué et non échu dont l'utilisateur est toujours membre de l'organisation, depuis avant la création
// du jeton, revérifié à chaque appel. `kind` dit à la route qui le reçoit de quelle sorte il est (F9).
export async function verifyApiToken(
  token: string,
): Promise<{ tokenId: string; ctx: TenantContext; kind: ApiTokenKind } | null> {
  if (!API_TOKEN_PATTERN.test(token)) return null;
  const now = new Date();
  const [row] = await db
    .select({
      id: apiTokens.id,
      userId: apiTokens.userId,
      tenantId: apiTokens.tenantId,
      lastUsedAt: apiTokens.lastUsedAt,
      kind: apiTokens.kind,
    })
    .from(apiTokens)
    // Un membre retiré puis réinvité ne retrouve pas les jetons de son ancienne adhésion.
    .innerJoin(members, currentMembership)
    .where(
      and(
        eq(apiTokens.tokenHash, hashApiToken(token)),
        isNull(apiTokens.revokedAt),
        or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, now)),
      ),
    )
    .limit(1);
  if (!row) return null;

  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > LAST_USED_PRECISION_MS) {
    await db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, row.id));
  }
  const ctx = {
    tenantId: row.tenantId,
    userId: row.userId,
    principals: principalsFor(row.userId, row.tenantId),
  };
  return { tokenId: row.id, ctx, kind: row.kind };
}
