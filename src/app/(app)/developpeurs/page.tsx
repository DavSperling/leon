import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Developpeurs } from '@/components/verre/developpeurs';
import { requireUserContext } from '@/server/auth/session';
import { developerSpace } from '@/server/developpeurs/space';

export const metadata: Metadata = { title: 'Développeurs' };

// Réservée aux membres qui codent (une session Claude Code ou une note de passation) ; les autres voient une page
// introuvable, pas un refus.
export default async function DeveloppeursPage() {
  const ctx = await requireUserContext();
  const space = await developerSpace(ctx);
  if (space === null) notFound();
  return <Developpeurs space={space} viewerId={ctx.userId} />;
}
