import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { nextAfterTools, toolStates } from '@/components/verre/onboarding/tools-model';
import { ToolsStep } from '@/components/verre/onboarding/tools-step';
import { oauthNotice } from '@/lib/connection-form';
import { DEPARTMENTS, isDepartment, onboardingSteps } from '@/lib/onboarding';
import { isSoleMember, readOnboardingMember, spaceRole } from '@/server/auth/onboarding';
import { getSession, getUserContext } from '@/server/auth/session';
import { listCatalog } from '@/server/connectors/catalog';
import { listConnections } from '@/server/connectors/connections';
import { connectorsKey } from '@/server/connectors/crypto';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('onboarding.tools'))('title') };
}

// Jamais requireUserContext() : sans espace, il renverrait vers /bienvenue, qui n'a pas la même règle. L'étape 1 doit
// être faite : elle donne le service, donc les outils conseillés.
export default async function ToolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect('/connexion');

  const ctx = await getUserContext();
  if (!ctx) redirect('/bienvenue');

  const member = await readOnboardingMember(ctx);
  if (!member) redirect('/');
  if (member.onboardedAt === null) redirect('/bienvenue');

  const locale = await getLocale();
  const catalog = listCatalog(locale);
  const recommended =
    member.department !== null && isDepartment(member.department)
      ? DEPARTMENTS[member.department].tools
      : [];
  // Les connexions de l'espace restent côté serveur (config, indice du secret) : le client ne reçoit que l'état de chaque outil,
  // avec ma propre connexion en erreur (`broken`) pour la reconnecter, jamais celle d'un collègue.
  const conns = await listConnections(ctx);
  // Le retour de l'éditeur (`?branche=` ou `?erreur=`). Le lien d'accord de l'administrateur vient du
  // catalogue, jamais de l'adresse.
  const notice = oauthNotice(await searchParams, locale);
  const owner = spaceRole(member.role) === 'owner';
  const soleOwner = owner && (await isSoleMember(ctx));
  return (
    <ToolsStep
      states={toolStates(catalog, conns, recommended)}
      viewerId={ctx.userId}
      now={new Date()}
      canConnect={connectorsKey() !== null}
      consentUrl={catalog.find((item) => item.id === notice?.tool)?.adminConsentUrl ?? null}
      nextHref={nextAfterTools(soleOwner)}
      steps={onboardingSteps(soleOwner ? 'soleOwner' : owner ? 'ownerWithTeam' : 'member')}
      notice={notice}
    />
  );
}
