'use server';

import { redirect } from 'next/navigation';
import type { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import {
  COMPANY_SIZES,
  DEPARTMENT_IDS,
  GOALS,
  isDepartment,
  isJobOf,
  SENIORITY_LEVELS,
} from '@/lib/onboarding';
import {
  completeMemberStep,
  completeOwnerStep,
  readOnboardingMember,
  spaceRole,
} from '@/server/auth/onboarding';
import { getSession, getUserContext } from '@/server/auth/session';
import { createOrganizationForUser, SignUpInputSchema } from '@/server/auth/sign-up';
import { resolveTenantContext } from '@/server/auth/tenant-context';

// Même forme que AuthFormState : `errors` a un message par champ (`form` pour ce qui ne vise aucun champ),
// `values` rend ce qui a été saisi pour ne pas vider le formulaire.
export type AboutStepState = {
  errors?: Record<string, string>;
  values?: Record<string, string | string[]>;
};

type Translator = ReturnType<typeof useTranslations<'onboarding'>>;

// Cette action est la frontière de confiance : completeOwnerStep et completeMemberStep écrivent ce qu'on leur donne,
// la base ne contraint que le niveau et la taille. Chaque identifiant est donc vérifié ici contre les listes de
// `@/lib/onboarding`. Les schémas ne portent aucun message : fieldErrors() pose celui de chaque champ.
const GoalsSchema = z.array(z.enum(GOALS)).transform((goals) => [...new Set(goals)]);
const MemberStepSchema = z.object({ goals: GoalsSchema });
const OwnerStepSchema = z
  .object({
    department: z.enum(DEPARTMENT_IDS),
    job: z.string(),
    seniority: z.coerce.number().int().min(1).max(SENIORITY_LEVELS.length),
    size: z.enum(COMPANY_SIZES),
    goals: GoalsSchema,
  })
  // `when` : le poste se vérifie même si un autre champ est faux, pour signaler toutes les erreurs d'un coup.
  .refine(({ department, job }) => isJobOf(department, job), {
    path: ['job'],
    when: ({ value }) => isDepartment(String((value as { department?: unknown }).department)),
  });
const CompanyNameSchema = SignUpInputSchema.shape.organizationName;

function fieldErrors(error: z.ZodError, t: Translator): Record<string, string> {
  const messages: Record<string, string> = {
    organizationName: t('errors.company'),
    department: t('errors.department'),
    job: t('errors.job'),
    seniority: t('errors.seniority'),
    size: t('errors.size'),
  };
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0]);
    // Une attente inconnue ne vient que d'un formulaire truqué : pas de champ où l'afficher.
    const key = field in messages ? field : 'form';
    errors[key] ??= messages[field] ?? t('errors.form');
  }
  return errors;
}

export async function completeAboutStepAction(
  _previous: AboutStepState,
  formData: FormData,
): Promise<AboutStepState> {
  const session = await getSession();
  if (!session) redirect('/connexion');

  const t = await getTranslations('onboarding');
  const text = (name: string) => String(formData.get(name) ?? '').trim();
  const values = {
    organizationName: text('organizationName'),
    department: text('department'),
    job: text('job'),
    seniority: text('seniority'),
    size: text('size'),
    goals: formData.getAll('goals').map(String),
  };
  const formError = { errors: { form: t('errors.form') }, values };

  let ctx = await getUserContext();
  if (!ctx) {
    // Un nouveau venu : l'organisation n'est créée que si tout le formulaire est bon.
    const company = CompanyNameSchema.safeParse(values.organizationName);
    const owner = OwnerStepSchema.safeParse(values);
    if (!company.success || !owner.success) {
      return {
        errors: {
          ...(company.success ? {} : { organizationName: t('errors.company') }),
          ...(owner.success ? {} : fieldErrors(owner.error, t)),
        },
        values,
      };
    }
    const created = await createOrganizationForUser(session.user.id, company.data);
    if (!created.ok && created.error === 'invalide') return formError;
    // `deja_membre` : le premier de deux clics a déjà créé l'espace, on poursuit avec lui.
    ctx = created.ok
      ? await resolveTenantContext(session.user.id, created.tenantId)
      : await getUserContext();
    if (!ctx) return formError;
  }

  const member = await readOnboardingMember(ctx);
  if (!member) return formError;
  if (member.onboardedAt !== null) redirect('/');

  // Seul le propriétaire écrit service, poste, niveau et taille ; tout autre rôle, ses attentes seulement.
  // Un `false` (étape validée entre-temps par l'autre clic) mène aussi à l'appli, dont la règle de redirection tranche.
  if (spaceRole(member.role) === 'owner') {
    const owner = OwnerStepSchema.safeParse(values);
    if (!owner.success) return { errors: fieldErrors(owner.error, t), values };
    await completeOwnerStep(ctx, owner.data);
  } else {
    const goals = MemberStepSchema.safeParse(values);
    if (!goals.success) return { errors: fieldErrors(goals.error, t), values };
    await completeMemberStep(ctx, goals.data.goals);
  }
  redirect('/');
}
