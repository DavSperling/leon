import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { members, users } from '@/server/db/schema/auth';
import { withTenant } from '@/server/db/with-tenant';

export type TenantContext = {
  readonly tenantId: string;
  readonly userId: string;
  readonly principals: readonly string[];
  // Lire aussi le privé des gens sous la personne (0057) : seulement pour la recherche, l'aperçu et « Mon équipe »,
  // qui n'écrivent rien.
  readonly equipe?: boolean;
};

const UuidSchema = z.uuid();

// Soi + « l'équipe » (le principal de l'organisation) + ses groupes (0055) : son service, et les groupes libres où un
// administrateur l'a mis. Lus sous RLS, dans l'organisation seulement. Soi d'abord : rien ne doit dépendre de l'ordre,
// mais un message d'erreur ou un test le lit plus facilement.
export async function principalsFor(userId: string, tenantId: string): Promise<string[]> {
  const base = [userId, tenantId];
  const { rows } = await withTenant({ tenantId, userId, principals: base }, (tx) =>
    tx.execute<{ id: string }>(sql`
      select g.id from groupes g
      join member m on m."organizationId" = g.tenant_id and m."userId" = ${userId}
      where g.tenant_id = ${tenantId}
        and (g.service = m.department
             or exists (select 1 from membres_groupe mg where mg.groupe_id = g.id and mg.member_id = m.id))
      order by g.id`),
  );
  return [...base, ...rows.map((row) => row.id)];
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
  return { tenantId: resolved, userId, principals: await principalsFor(userId, resolved) };
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
