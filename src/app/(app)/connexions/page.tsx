import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Connexions } from '@/components/verre/connexions';
import { oauthNotice } from '@/lib/connection-form';
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
  const [connections, channels] = await Promise.all([listConnections(ctx), channelHealth(ctx)]);
  const catalog = listCatalog();
  // Le retour de l'éditeur (`?branche=` ou `?erreur=`). Le lien d'accord de l'administrateur vient du
  // catalogue, jamais de l'adresse.
  const notice = oauthNotice(await searchParams, await getLocale());
  const consentUrl = catalog.find((item) => item.id === notice?.tool)?.adminConsentUrl ?? null;
  const now = new Date();
  return (
    <Connexions
      catalog={catalog}
      connections={connections}
      viewerId={ctx.userId}
      canConnect={connectorsKey() !== null}
      notice={notice}
      consentUrl={consentUrl}
      channels={channels}
      stale={staleChannels(channels, now).map((channel) => channel.kind)}
      now={now}
    />
  );
}
