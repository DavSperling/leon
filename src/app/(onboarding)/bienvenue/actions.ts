'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { PROVIDER_IDS } from '@/capture/turn';
import { TOOLS_COOKIE, toolsCookieValue } from '@/components/verre/onboarding/tools-model';
import { COMPANY_SIZES, GOALS } from '@/lib/onboarding';
import {
  completeMemberStep,
  completeOwnerStep,
  isSoleMember,
  PlacementSchema,
  readOnboardingMember,
  spaceRole,
} from '@/server/auth/onboarding';
import { getSession, getUserContext } from '@/server/auth/session';
import { createOrganizationForUser, SignUpInputSchema } from '@/server/auth/sign-up';
import { resolveTenantContext } from '@/server/auth/tenant-context';

// `errors` a un code par champ (`form` pour ce qui ne vise aucun champ). Le code est une clé de `onboarding.errors` :
// le composant le traduit à l'affichage, donc un changement de langue après un refus traduit aussi les erreurs.
export type AboutStepErrorCode = 'company' | 'department' | 'job' | 'seniority' | 'size' | 'form';
export type AboutStepField =
  | 'organizationName'
  | 'department'
  | 'job'
  | 'seniority'
  | 'size'
  | 'form';
export type AboutStepErrors = Partial<Record<AboutStepField, AboutStepErrorCode>>;
export type AboutStepState = { errors?: AboutStepErrors };

// Cette action est la frontière de confiance : completeOwnerStep et completeMemberStep écrivent ce qu'on leur donne,
// la base ne contraint que le niveau et la taille. Chaque identifiant est donc vérifié ici contre les listes de
// `@/lib/onboarding`. Les schémas ne portent aucun message : fieldErrors() pose le code de chaque champ.
const GoalsSchema = z.array(z.enum(GOALS)).transform((goals) => [...new Set(goals)]);
const MemberStepSchema = z.object({ goals: GoalsSchema });
const OwnerStepSchema = PlacementSchema.safeExtend({
  size: z.enum(COMPANY_SIZES),
  goals: GoalsSchema,
});
const CompanyNameSchema = SignUpInputSchema.shape.organizationName;

const OWNER_FIELDS = ['department', 'job', 'seniority', 'size'] as const;
const isOwnerField = (field: string): field is (typeof OWNER_FIELDS)[number] =>
  (OWNER_FIELDS as readonly string[]).includes(field);

// Pour ces champs, le code porte le nom du champ.
function fieldErrors(error: z.ZodError): AboutStepErrors {
  const errors: AboutStepErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0]);
    // Une attente inconnue ne vient que d'un formulaire truqué : pas de champ où l'afficher.
    const key = isOwnerField(field) ? field : 'form';
    errors[key] ??= key;
  }
  return errors;
}

export async function completeAboutStepAction(
  _previous: AboutStepState,
  formData: FormData,
): Promise<AboutStepState> {
  const session = await getSession();
  if (!session) redirect('/connexion');

  const text = (name: string) => String(formData.get(name) ?? '').trim();
  const values = {
    organizationName: text('organizationName'),
    department: text('department'),
    job: text('job'),
    seniority: text('seniority'),
    size: text('size'),
    goals: formData.getAll('goals').map(String),
  };
  const formError: AboutStepState = { errors: { form: 'form' } };

  let ctx = await getUserContext();
  if (!ctx) {
    // Un nouveau venu : l'organisation n'est créée que si tout le formulaire est bon.
    const company = CompanyNameSchema.safeParse(values.organizationName);
    const owner = OwnerStepSchema.safeParse(values);
    if (!company.success || !owner.success) {
      return {
        errors: {
          ...(company.success ? {} : { organizationName: 'company' as const }),
          ...(owner.success ? {} : fieldErrors(owner.error)),
        },
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
  // Un `false` (étape validée entre-temps par l'autre clic) ne change pas la suite : l'appli avec une équipe, Vos outils sinon.
  if (spaceRole(member.role) === 'owner') {
    const owner = OwnerStepSchema.safeParse(values);
    if (!owner.success) return { errors: fieldErrors(owner.error) };
    await completeOwnerStep(ctx, owner.data);
    // Avec une équipe déjà là, l'appli : ni Vos outils ni Collaborateurs (spec : « Pas d'étapes 2 et 3 »).
    if (!(await isSoleMember(ctx))) redirect('/');
  } else {
    const goals = MemberStepSchema.safeParse(values);
    if (!goals.success) return { errors: fieldErrors(goals.error) };
    await completeMemberStep(ctx, goals.data.goals);
  }
  redirect('/bienvenue/outils');
}

// Le choix de l'étape Vos outils, puis la file « Branchez-les un par un ». Un identifiant inconnu ne vient que d'un
// formulaire truqué : il est ignoré ; la page ne garde ensuite que les outils qu'elle propose.
export async function chooseToolsAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/connexion');
  const ids = PROVIDER_IDS.filter((id) => formData.getAll('outils').includes(id));
  (await cookies()).set(TOOLS_COOKIE, toolsCookieValue(session.user.id, ids), {
    maxAge: 60 * 60 * 24 * 7,
    path: '/bienvenue',
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
  redirect('/bienvenue/outils?etape=brancher');
}
