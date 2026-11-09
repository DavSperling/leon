import { and, eq, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { groupes, membresGroupe } from '@/server/db/schema/groupes';
import { withTenant } from '@/server/db/with-tenant';
import type { TenantContext } from './tenant-context';

// Les groupes de l'organisation (0055). Tout membre les lit, pour partager un document ; seuls un propriétaire ou un
// administrateur les écrivent, et c'est la base qui le vérifie (app_est_admin) : ici, rien n'est écrit sans elle.

export const GroupNameSchema = z.string().trim().min(1).max(80);
const IdSchema = z.uuid();

export type Groupe = {
  id: string;
  service: string | null; // groupe d'un service : son identifiant (DEPARTMENTS), l'écran le traduit
  nom: string | null; // groupe libre
  membres: string[]; // id des membres (member.id) ; ceux du service pour un groupe de service
};

// Les services d'abord, dans l'ordre de leur identifiant, puis les groupes libres par nom.
export async function listGroups(ctx: TenantContext): Promise<Groupe[]> {
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<Groupe>(sql`
      select g.id, g.service, g.nom,
        coalesce(array(
          select m.id from member m join "user" u on u.id = m."userId"
          where m."organizationId" = g.tenant_id and u.deleted_at is null
            and (m.department = g.service
                 or exists (select 1 from membres_groupe mg where mg.groupe_id = g.id and mg.member_id = m.id))
          order by m.id), '{}') as membres
      from groupes g
      where g.tenant_id = ${ctx.tenantId}
      order by g.service is null, g.service, lower(g.nom)`),
  );
  return rows;
}

// Le code Postgres d'une erreur ; drizzle l'emballe (« Failed query… ») et le range dans `cause`.
const pgCode = (error: unknown): unknown => {
  if (typeof error !== 'object' || error === null) return null;
  if ('code' in error) return error.code;
  return 'cause' in error ? pgCode(error.cause) : null;
};
// « new row violates row-level security policy » : la base a refusé l'écriture.
const isRlsRefusal = (error: unknown) => pgCode(error) === '42501';

// Crée un groupe libre (`id` null) ou le renomme. « refuse » pour qui n'est ni propriétaire ni administrateur (la base
// refuse l'écriture), pour un groupe de service, ou un nom vide ; « nom_pris » si un autre groupe porte déjà ce nom.
export async function saveGroup(
  ctx: TenantContext,
  id: string | null,
  nom: string,
): Promise<{ id: string } | 'nom_pris' | 'refuse'> {
  const parsed = GroupNameSchema.safeParse(nom);
  if (!parsed.success || (id !== null && !IdSchema.safeParse(id).success)) return 'refuse';
  try {
    const [row] = await withTenant(ctx, (tx) =>
      id === null
        ? tx
            .insert(groupes)
            .values({ tenantId: ctx.tenantId, nom: parsed.data })
            .returning({ id: groupes.id })
        : tx
            .update(groupes)
            .set({ nom: parsed.data })
            .where(eq(groupes.id, id))
            .returning({ id: groupes.id }),
    );
    return row ?? 'refuse';
  } catch (error) {
    if (pgCode(error) === '23505') return 'nom_pris';
    if (isRlsRefusal(error)) return 'refuse';
    throw error;
  }
}

// Ce qui était partagé au groupe ne l'est plus qu'aux autres groupes de son ACL, ou à son auteur (supprimer_groupe).
export async function deleteGroup(ctx: TenantContext, id: string): Promise<boolean> {
  if (!IdSchema.safeParse(id).success) return false;
  const { rows } = await withTenant(ctx, (tx) =>
    tx.execute<{ deleted: boolean }>(sql`select supprimer_groupe(${id}) as deleted`),
  );
  return rows[0]?.deleted === true;
}

// Les membres d'un groupe libre, d'un coup : ceux qui ne sont plus cochés sortent, les nouveaux entrent. Faux pour qui
// n'est ni propriétaire ni administrateur, pour un groupe de service, ou pour un membre d'une autre organisation (la
// base refuse l'insertion et la transaction annule tout).
export async function setGroupMembers(
  ctx: TenantContext,
  id: string,
  memberIds: readonly string[],
): Promise<boolean> {
  if (!IdSchema.safeParse(id).success || !z.array(IdSchema).max(500).safeParse(memberIds).success)
    return false;
  const wanted = [...new Set(memberIds)];
  try {
    return await withTenant(ctx, async (tx) => {
      const { rows } = await tx.execute<{ admin: boolean }>(sql`select app_est_admin() as admin`);
      if (rows[0]?.admin !== true) return false;
      const [groupe] = await tx
        .select({ service: groupes.service })
        .from(groupes)
        .where(eq(groupes.id, id))
        .for('update');
      if (!groupe || groupe.service !== null) return false;
      await tx
        .delete(membresGroupe)
        .where(
          and(
            eq(membresGroupe.groupeId, id),
            wanted.length > 0 ? notInArray(membresGroupe.memberId, wanted) : undefined,
          ),
        );
      if (wanted.length > 0)
        await tx
          .insert(membresGroupe)
          .values(wanted.map((memberId) => ({ tenantId: ctx.tenantId, groupeId: id, memberId })))
          .onConflictDoNothing();
      return true;
    });
  } catch (error) {
    if (isRlsRefusal(error)) return false;
    throw error;
  }
}
