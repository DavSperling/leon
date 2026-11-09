import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Connexions } from '@/components/verre/connexions';
import { oauthNotice, setupReturn } from '@/lib/connection-form';
import { DEPARTMENTS, isDepartment } from '@/lib/onboarding';
import { listGroups } from '@/server/auth/groupes';
import { readOnboardingMember } from '@/server/auth/onboarding';
import { requireUserContext } from '@/server/auth/session';
import { listCatalog } from '@/server/connectors/catalog';
import { listConnections } from '@/server/connectors/connections';
import { connectorsKey } from '@/server/connectors/crypto';
import { channelHealth, staleChannels } from '@/server/memory/sources';

export async function generateMetadata(): Promise<Metadata> {
  return { title: await (await getTranslations('connections'))('title') };
}

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireUserContext();
  const params = await searchParams;
  const back = setupReturn(params);
  if (back) redirect(back);
  const [connections, channels, member, groups] = await Promise.all([
    listConnections(ctx),
    channelHealth(ctx),
    readOnboardingMember(ctx),
    listGroups(ctx),
  ]);
  const locale = await getLocale();
  const catalog = listCatalog(locale);
  // Le retour de l'éditeur (`?branche=` ou `?erreur=`). Le lien d'accord de l'administrateur vient du
  // catalogue, jamais de l'adresse.
  const notice = oauthNotice(params, locale);
  const consentUrl = catalog.find((item) => item.id === notice?.tool)?.adminConsentUrl ?? null;
  const now = new Date();
  // Les outils du service de la personne ; vide tant qu'elle n'a pas dit lequel.
  const recommended =
    member?.department && isDepartment(member.department)
      ? [...DEPARTMENTS[member.department].tools]
      : [];
  return (
    <Connexions
      catalog={catalog}
      recommended={recommended}
      connections={connections}
      viewerId={ctx.userId}
      canConnect={connectorsKey() !== null}
      notice={notice}
      consentUrl={consentUrl}
      channels={channels}
      stale={staleChannels(channels, now).map((channel) => channel.kind)}
      now={now}
      groups={groups.map(({ id, service, nom }) => ({ id, service, nom }))}
    />
  );
}
