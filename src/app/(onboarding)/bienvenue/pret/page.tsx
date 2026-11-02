import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DoneStep } from '@/components/verre/onboarding/done-step';
import { readOnboardingMember, spaceRole } from '@/server/auth/onboarding';
import { getSession, getUserContext } from '@/server/auth/session';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('onboarding.done'))('title') };
}

// Jamais requireUserContext() (voir l'étape Vos outils). Seul l'aperçu change : le propriétaire prépare son espace,
// qui l'a invité le trouve prêt.
export default async function DonePage() {
  const session = await getSession();
  if (!session) redirect('/connexion');

  const ctx = await getUserContext();
  if (!ctx) redirect('/bienvenue');

  const member = await readOnboardingMember(ctx);
  if (!member) redirect('/');
  if (member.onboardedAt === null) redirect('/bienvenue');

  return <DoneStep owner={spaceRole(member.role) === 'owner'} />;
}
