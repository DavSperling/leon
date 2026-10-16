import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function TaskNotFound() {
  return (
    <div className="p-6">
      <h1 className="mb-4 text-base font-semibold">
        Cette tâche n'existe pas ou ne vous est pas visible.
      </h1>
      <Button asChild variant="outline" size="sm">
        <Link href="/taches">Retour aux tâches</Link>
      </Button>
    </div>
  );
}
