'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/verre/ui/button';

// Erreur d'un écran, dans le panneau (l'ossature reste) : la carte d'état vide, un titre court, un seul bouton.
// Le message de l'erreur n'est jamais affiché : il pourrait contenir du texte de la mémoire.
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="max-w-[880px]">
      <div className="flex flex-col items-center rounded-box border border-line bg-glass px-6 py-16 text-center shadow-hi">
        {/* annoncée même sans changement de chemin (l'ossature ne déplace alors pas le focus) */}
        <div role="alert">
          <h1 className="text-title font-semibold tracking-[-0.015em] text-fg">
            Impossible de charger la page.
          </h1>
          <p className="mt-1.5 max-w-[46ch] text-body text-muted">Réessayez dans un instant.</p>
        </div>
        <div className="mt-5">
          <Button variant="secondary" icon={RotateCcw} onClick={reset}>
            Réessayer
          </Button>
        </div>
      </div>
    </div>
  );
}
