import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { TeammatesStep } from '@/components/verre/onboarding/teammates-step';
import { onboardingSteps } from '@/lib/onboarding';
import { canInvite } from '@/server/auth/members';
import { readOnboardingMember } from '@/server/auth/onboarding';
import { getSession, getUserContext } from '@/server/auth/session';
import { getViewerProfile } from '@/server/auth/viewer';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('onboarding.teammates'))('title') };
}

// Jamais requireUserContext() : sans espace, il renverrait vers /bienvenue, qui n'a pas la même règle. L'étape 1 doit
// être faite (le poste du propriétaire figure dans l'aperçu), et seul qui peut inviter voit cet écran.
export default async function TeammatesPage() {
  const session = await getSession();
  if (!session) redirect('/connexion');

  const ctx = await getUserContext();
  if (!ctx) redirect('/bienvenue');

  const member = await readOnboardingMember(ctx);
  if (!member) redirect('/');
  if (member.onboardedAt === null) redirect('/bienvenue');
  if (!(await canInvite(ctx))) redirect('/');

  const profile = await getViewerProfile(ctx);
  return (
    <TeammatesStep
      steps={onboardingSteps('soleOwner')}
      organizationName={profile.organizationName}
      you={{
        name: profile.userName,
        placement: { department: member.department, job: member.job, seniority: member.seniority },
      }}
    />
  );
}
