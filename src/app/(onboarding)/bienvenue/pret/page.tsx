import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { DoneStep } from '@/components/verre/onboarding/done-step';
import { toolStates } from '@/components/verre/onboarding/tools-model';
import { readOnboardingMember } from '@/server/auth/onboarding';
import { getSession, getUserContext } from '@/server/auth/session';
import { listCatalog } from '@/server/connectors/catalog';
import { listConnections } from '@/server/connectors/connections';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('onboarding.done'))('title') };
}

// Jamais requireUserContext() (voir l'étape Vos outils). Le même écran pour le propriétaire et pour l'invité.
export default async function DonePage() {
  const session = await getSession();
  if (!session) redirect('/connexion');

  const ctx = await getUserContext();
  if (!ctx) redirect('/bienvenue');

  const member = await readOnboardingMember(ctx);
  if (!member) redirect('/');
  if (member.onboardedAt === null) redirect('/bienvenue');

  // Ce que Leon lit déjà pour cette personne : la même règle que l'étape Vos outils (le mien ou celui de l'espace,
  // jamais l'outil privé d'un collègue, jamais ma connexion en erreur).
  const reading = toolStates(
    listCatalog(await getLocale(), '/bienvenue/outils'),
    await listConnections(ctx),
    [],
  )
    .filter((state) => state.status !== 'free' && state.broken === null)
    .map((state) => ({ id: state.item.id, label: state.item.label }));

  return <DoneStep reading={reading} />;
}
