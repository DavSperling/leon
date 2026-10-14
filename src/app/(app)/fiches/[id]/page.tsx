import { notFound } from 'next/navigation';
import { z } from 'zod';
import { CardView } from '@/components/card-view';
import { requireUserContext } from '@/server/auth/session';
import { fetchCard } from '@/server/memory/fetch-card';

type FichePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ onglet?: string }>;
};

// Un id inexistant ou invisible donne la même réponse : on ne révèle rien sur les fiches des autres.
export default async function FichePage({ params, searchParams }: FichePageProps) {
  const { id } = await params;
  const { onglet } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();

  const ctx = await requireUserContext();
  const fetched = await fetchCard(ctx, { id, client: 'interface' });
  if (!fetched) notFound();

  const initialTab = onglet === 'brut' ? 'brut' : 'fiche';
  return (
    <CardView
      key={`${fetched.card.id}:${initialTab}`}
      card={fetched.card}
      text={fetched.text}
      initialTab={initialTab}
    />
  );
}
