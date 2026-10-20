import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-[360px] px-4 py-16">
      <h1 className="mb-4 text-base font-medium">Cette page n'existe pas.</h1>
      <Button asChild variant="outline" size="sm">
        <Link href="/">Retour à l'accueil</Link>
      </Button>
    </main>
  );
}
