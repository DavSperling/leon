import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AboutStep } from '@/components/verre/onboarding/about-step';
import { readOnboardingMember, spaceRole } from '@/server/auth/onboarding';
import { getSession, getUserContext } from '@/server/auth/session';
import { getViewerProfile } from '@/server/auth/viewer';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('onboarding'))('metaTitle') };
}

// Jamais requireUserContext() : sans espace, il renverrait ici même, en boucle. Sans session, la connexion ; avec une
// session, l'écran se rabat sur ce que la personne est : un nouveau venu sans espace, le propriétaire, ou un membre.
export default async function WelcomePage() {
  const session = await getSession();
  if (!session) redirect('/connexion');

  const ctx = await getUserContext();
  if (!ctx) {
    return (
      <AboutStep
        mode="newcomer"
        spaceRole="owner"
        userName={session.user.name}
        organizationName={null}
        placement={null}
      />
    );
  }

  // Étape déjà validée (ou ligne de membre introuvable) : l'appli, dont la règle de redirection tranche.
  const member = await readOnboardingMember(ctx);
  if (!member || member.onboardedAt !== null) redirect('/');

  const role = spaceRole(member.role);
  const profile = await getViewerProfile(ctx);
  return (
    <AboutStep
      mode={role === 'owner' ? 'owner' : 'member'}
      spaceRole={role}
      userName={profile.userName}
      organizationName={profile.organizationName}
      placement={
        role === 'owner'
          ? null
          : { department: member.department, job: member.job, seniority: member.seniority }
      }
    />
  );
}
