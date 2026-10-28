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

// Un ancien membre (compte supprimé, 0040) garde son adhésion mais n'entre plus : une session ouverte pendant la
// suppression ne mène nulle part. Seul le travail de fond sur ce qu'il a laissé à l'organisation (indexation,
// vecteurs) passe `includeFormer`.
type ResolveOptions = { includeFormer?: boolean };
const activeMember = (userId: string, includeFormer: boolean) =>
  and(eq(members.userId, userId), includeFormer ? undefined : isNull(users.deletedAt));

export async function firstOrganizationId(
  userId: string,
  { includeFormer = false }: ResolveOptions = {},
): Promise<string | null> {
  const [row] = await db
    .select({ organizationId: members.organizationId })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(activeMember(userId, includeFormer))
    .orderBy(asc(members.createdAt), asc(members.id))
    .limit(1);
  return row?.organizationId ?? null;
}

async function isMember(
  userId: string,
  tenantId: string,
  includeFormer: boolean,
): Promise<boolean> {
  const rows = await db
    .select({ id: members.id })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(and(activeMember(userId, includeFormer), eq(members.organizationId, tenantId)))
    .limit(1);
  return rows.length > 0;
}

// Vérifie l'appartenance dans `member` ; tenantId null = première organisation de l'utilisateur.
export async function resolveTenantContext(
  userId: string,
  tenantId: string | null,
  { includeFormer = false }: ResolveOptions = {},
): Promise<TenantContext | null> {
  if (!UuidSchema.safeParse(userId).success) return null;
  if (tenantId !== null && !UuidSchema.safeParse(tenantId).success) return null;

  const resolved =
    tenantId === null
      ? await firstOrganizationId(userId, { includeFormer })
      : (await isMember(userId, tenantId, includeFormer))
        ? tenantId
        : null;
  if (resolved === null) return null;
  return { tenantId: resolved, userId, principals: principalsFor(userId, resolved) };
}

// Le contexte d'une session. Un membre retiré garde son ancienne organisation active (Better Auth ne la remet pas à
// zéro) : on se rabat alors sur sa première organisation, pour que pages et routes d'API suivent la même règle.
export async function resolveSessionContext(
  userId: string,
  activeOrganizationId: string | null,
): Promise<TenantContext | null> {
  return (
    (await resolveTenantContext(userId, activeOrganizationId)) ??
    (activeOrganizationId ? resolveTenantContext(userId, null) : null)
  );
}
