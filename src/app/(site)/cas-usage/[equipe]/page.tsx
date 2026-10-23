import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TEAMS, teamBySlug } from '@/components/site/content';
import { EquipePage } from '@/components/site/pages/cas-usage';

type Params = Promise<{ equipe: string }>;

// Une page par équipe, construite d'avance ; toute autre adresse donne la page introuvable.
export const dynamicParams = false;

export function generateStaticParams() {
  return TEAMS.map((t) => ({ equipe: t.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const team = teamBySlug((await params).equipe);
  if (!team) return {};
  return { title: `${team.label} · Cas d’usage`, description: team.lead };
}

export default async function Page({ params }: { params: Params }) {
  const team = teamBySlug((await params).equipe);
  if (!team) notFound();
  return <EquipePage team={team} />;
}
