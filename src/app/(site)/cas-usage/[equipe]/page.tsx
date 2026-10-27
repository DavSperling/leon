import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { contentFor, TEAMS, teamBySlug } from '@/components/site/content';
import { EquipePage } from '@/components/site/pages/cas-usage';

type Params = Promise<{ equipe: string }>;

// Une page par équipe ; toute autre adresse donne la page introuvable. Les adresses sont les mêmes dans les deux
// langues : seul le texte de l'équipe suit la langue de la requête.
const teamOf = async (params: Params) =>
  teamBySlug((await params).equipe, contentFor(await getLocale()).teams);

export const dynamicParams = false;

export function generateStaticParams() {
  return TEAMS.map((t) => ({ equipe: t.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const team = await teamOf(params);
  if (!team) return {};
  const t = await getTranslations('site.meta');
  return { title: t('teamTitle', { team: team.label }), description: team.lead };
}

export default async function Page({ params }: { params: Params }) {
  const team = await teamOf(params);
  if (!team) notFound();
  return <EquipePage team={team} />;
}
