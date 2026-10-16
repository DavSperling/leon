import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { members } from '@/server/db/schema/auth';

export type TenantContext = {
  readonly tenantId: string;
  readonly userId: string;
  readonly principals: readonly string[];
};

const UuidSchema = z.uuid();

// Soi + « l'équipe » (le principal de l'organisation).
export function principalsFor(userId: string, tenantId: string): string[] {
  return [userId, tenantId];
}

export async function firstOrganizationId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ organizationId: members.organizationId })
    .from(members)
    .where(eq(members.userId, userId))
    .orderBy(asc(members.createdAt), asc(members.id))
    .limit(1);
  return row?.organizationId ?? null;
}

export async function isMember(userId: string, tenantId: string): Promise<boolean> {
  const rows = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.userId, userId), eq(members.organizationId, tenantId)))
    .limit(1);
  return rows.length > 0;
}

// Vérifie l'appartenance dans `member` ; tenantId null = première organisation de l'utilisateur.
export async function resolveTenantContext(
  userId: string,
  tenantId: string | null,
): Promise<TenantContext | null> {
  if (!UuidSchema.safeParse(userId).success) return null;
  if (tenantId !== null && !UuidSchema.safeParse(tenantId).success) return null;

  const resolved =
    tenantId === null
      ? await firstOrganizationId(userId)
      : (await isMember(userId, tenantId))
        ? tenantId
        : null;
  if (resolved === null) return null;
  return { tenantId: resolved, userId, principals: principalsFor(userId, resolved) };
}
