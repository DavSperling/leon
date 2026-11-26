import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Agents } from '@/components/verre/agents';
import { requireUserContext } from '@/server/auth/session';
import { logError } from '@/server/log';
import { AGENTS } from '@/server/portrait/agents';
import { readAgentsScreen } from '@/server/portrait/screen';

export async function generateMetadata(): Promise<Metadata> {
  return { title: await (await getTranslations('agents'))('title') };
}

// L'écran Agents : les agents de départ de la personne connectée, lus sous ses droits, et d'elle seule.
// `?agent=<id>` ouvre le panneau de cet agent.
export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string | string[] }>;
}) {
  const ctx = await requireUserContext();
  const { agent } = await searchParams;
  const asked = Array.isArray(agent) ? agent[0] : agent;
  // Une lecture qui échoue donne une erreur sur la page, pas une page cassée ni des agents tous éteints.
  const data = await readAgentsScreen(ctx).catch((error) => {
    logError('agents.screen', error);
    return null;
  });
  return <Agents data={data} openAgent={AGENTS.find((one) => one === asked) ?? null} />;
}
