'use client';

import { CircleX } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Le message de l'erreur n'est jamais affiché : il pourrait contenir le titre d'une tâche.
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div
      role="alert"
      className="m-6 flex items-center gap-3 rounded-md bg-destructive-soft px-4 py-3 text-destructive"
    >
      <CircleX size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
      <p className="flex-1">Impossible de charger les tâches. Réessayez.</p>
      <Button variant="outline" size="sm" onClick={reset}>
        Réessayer
      </Button>
    </div>
  );
}
