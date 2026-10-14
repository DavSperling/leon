import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function FicheNotFound() {
  return (
    <div className="p-6">
      <h1 className="mb-4 text-base font-semibold">
        Cette fiche n'existe pas ou ne vous est pas visible.
      </h1>
      <Button asChild variant="outline" size="sm">
        <Link href="/">Retour à l'accueil</Link>
      </Button>
    </div>
  );
}
