import { PageSkeleton } from '@/components/verre/ui/feedback';

// Squelette d'une page de lecture ; pas de spinner plein écran. La recherche a ses propres cartes fantômes.
export default function Loading() {
  return <PageSkeleton />;
}
