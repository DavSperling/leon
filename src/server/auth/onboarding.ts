import { and, eq, isNull, sql } from 'drizzle-orm';
import type { CompanySize, Department, Goal } from '@/lib/onboarding';
import { db } from '@/server/db/client';
import { members, organizations } from '@/server/db/schema/auth';
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

export async function readOnboardingMember(ctx: TenantContext): Promise<OnboardingMember | null> {
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
}

// La condition d'écriture est dans le SQL : « onboardedAt » nul, et pour le propriétaire seul, le rôle owner.
const pending = (ctx: TenantContext) =>
  and(
    eq(members.userId, ctx.userId),
    eq(members.organizationId, ctx.tenantId),
    isNull(members.onboardedAt),
  );

export async function completeOwnerStep(ctx: TenantContext, step: OwnerStep): Promise<boolean> {
  return db.transaction(async (tx) => {
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
    await tx
      .update(organizations)
      .set({ size: step.size })
      .where(eq(organizations.id, ctx.tenantId));
    return true;
  });
}

export async function completeMemberStep(ctx: TenantContext, goals: Goal[]): Promise<boolean> {
  const done = await db
    .update(members)
    .set({ goals, onboardedAt: sql`now()` })
    .where(pending(ctx))
    .returning({ id: members.id });
  return done.length > 0;
}
