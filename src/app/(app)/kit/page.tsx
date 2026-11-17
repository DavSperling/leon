import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { KitShowcase } from './showcase';

export const metadata: Metadata = { title: 'Kit', robots: { index: false, follow: false } };

// La planche du kit « Papier » : chaque pièce dans ses états, en clair et en sombre. Pour ceux qui construisent les
// écrans ; elle n'existe pas en production.
export default function KitPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <KitShowcase />;
}
