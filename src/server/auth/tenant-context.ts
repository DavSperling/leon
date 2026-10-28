import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { members, users } from '@/server/db/schema/auth';

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

// Un ancien membre (compte supprimé, 0039) garde son adhésion mais n'entre plus : une session ouverte pendant la
// suppression ne mène nulle part.
const activeMember = (userId: string) => and(eq(members.userId, userId), isNull(users.deletedAt));

export async function firstOrganizationId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ organizationId: members.organizationId })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(activeMember(userId))
    .orderBy(asc(members.createdAt), asc(members.id))
    .limit(1);
  return row?.organizationId ?? null;
}

async function isMember(userId: string, tenantId: string): Promise<boolean> {
  const rows = await db
    .select({ id: members.id })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(and(activeMember(userId), eq(members.organizationId, tenantId)))
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
