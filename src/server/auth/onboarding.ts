import { and, count, eq, isNull, sql } from 'drizzle-orm';
import { cache } from 'react';
import { z } from 'zod';
import {
  type CompanySize,
  DEPARTMENT_IDS,
  type Department,
  type Goal,
  isDepartment,
  isJobOf,
  SENIORITY_LEVELS,
} from '@/lib/onboarding';
import { markBriefingsStale } from '@/server/briefing/about';
import { db } from '@/server/db/client';
import { members, organizations, users } from '@/server/db/schema/auth';
import { logError } from '@/server/log';
import type { TenantContext } from './tenant-context';

// L'étape 1 de l'onboarding (docs/specs/2026-10-28-onboarding.md) : ce que la personne dit de son poste et de ses
// attentes. Seul le propriétaire fixe service, poste, niveau et taille ; un membre ne fait que choisir ses attentes
// (le reste vient d'un administrateur). Une étape validée ("onboardedAt" posé) ne se réécrit plus.

export type Placement = { department: string | null; job: string | null; seniority: number | null };
export type OnboardingMember = Placement & {
  role: string;
  goals: string[];
  onboardedAt: Date | null;
};
// Service, poste et niveau d'une personne : l'étape du propriétaire, le lien d'invitation et le choix d'un
// administrateur vérifient tous les trois contre les listes de `@/lib/onboarding`. Aucun message : le code d'erreur
// est le champ. `when` : le poste se vérifie même si un autre champ est faux (et résiste à une valeur nulle).
export const PlacementSchema = z
  .object({
    department: z.enum(DEPARTMENT_IDS),
    job: z.string(),
    seniority: z.coerce.number().int().min(1).max(SENIORITY_LEVELS.length),
  })
  .refine(({ department, job }) => isJobOf(department, job), {
    path: ['job'],
    when: ({ value }) =>
      isDepartment(String((value as { department?: unknown } | null | undefined)?.department)),
  });
export type ValidPlacement = z.infer<typeof PlacementSchema>;

export type OwnerStep = {
  department: Department;
  job: string;
  seniority: number;
  size: CompanySize;
  goals: Goal[];
};

// Better Auth peut ranger plusieurs rôles séparés par des virgules (comme isAdminRole, members.ts).
export function spaceRole(role: string): 'owner' | 'admin' | 'member' {
  const roles = role.split(',');
  if (roles.includes('owner')) return 'owner';
  return roles.includes('admin') ? 'admin' : 'member';
}

// cache() : lue par le layout et par des pages, une seule fois par rendu (même contexte, voir session.ts).
export const readOnboardingMember = cache(
  async (ctx: TenantContext): Promise<OnboardingMember | null> => {
    const [row] = await db
      .select({
        role: members.role,
        department: members.department,
        job: members.job,
        seniority: members.seniority,
        goals: members.goals,
        onboardedAt: members.onboardedAt,
      })
      .from(members)
      .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)))
      .limit(1);
    return row ?? null;
  },
);

// La condition d'écriture est dans le SQL : « onboardedAt » nul, et pour le propriétaire seul, le rôle owner.
const pending = (ctx: TenantContext) =>
  and(
    eq(members.userId, ctx.userId),
    eq(members.organizationId, ctx.tenantId),
    isNull(members.onboardedAt),
  );

export async function completeOwnerStep(ctx: TenantContext, step: OwnerStep): Promise<boolean> {
  const written = await db.transaction(async (tx) => {
    const done = await tx
      .update(members)
      .set({
        department: step.department,
        job: step.job,
        seniority: step.seniority,
        goals: step.goals,
        onboardedAt: sql`now()`,
      })
      .where(and(pending(ctx), sql`string_to_array(${members.role}, ',') && array['owner']`))
      .returning({ id: members.id });
    if (done.length === 0) return false;
    // La taille se pose une fois : un autre propriétaire qui passe l'étape ensuite ne réécrit pas celle de l'entreprise.
    await tx
      .update(organizations)
      .set({ size: step.size })
      .where(and(eq(organizations.id, ctx.tenantId), isNull(organizations.size)));
    return true;
  });
  if (written) {
    // Le poste change ce que le point du matin retient : ses points se refont. Il est déjà enregistré : un échec
    // ne remonte pas.
    try {
      await markBriefingsStale(ctx);
    } catch (error) {
      logError('briefing.mark_stale_failed', error, { tenantId: ctx.tenantId, userId: ctx.userId });
    }
  }
  return written;
}

export async function completeMemberStep(ctx: TenantContext, goals: Goal[]): Promise<boolean> {
  const done = await db
    .update(members)
    .set({ goals, onboardedAt: sql`now()` })
    .where(pending(ctx))
    .returning({ id: members.id });
  return done.length > 0;
}

// Vrai si l'espace n'a qu'un membre dont le compte n'est pas supprimé : seul, on n'a personne à inviter encore.
export async function isSoleMember(ctx: TenantContext): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(and(eq(members.organizationId, ctx.tenantId), isNull(users.deletedAt)));
  return row?.n === 1;
}
