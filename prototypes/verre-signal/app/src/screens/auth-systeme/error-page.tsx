import { RotateCcw } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components';
import { nb } from '@/lib';
import { StandaloneMessage } from './not-found';
import { ThemeToggle } from './theme-toggle';

// Erreur : dans le panneau (erreur d'un écran, l'ossature reste) ou seule sur l'aurore (l'ossature elle-même a échoué).
// Le message de l'erreur n'est jamais affiché : il pourrait contenir du texte de la mémoire.
// Même motif que les autres pages système : un titre court, la phrase, un seul bouton secondaire.

const TITLE = 'Impossible de charger la page.';
const HINT = 'Réessayez ; si ça persiste, regardez la page Sources.';

export function ErrorPage({ standalone: forced }: { standalone?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [standalone, setStandalone] = useState(forced ?? false);
  useLayoutEffect(() => {
    // shortcut: dans l'ossature, <main> suit le calque de verre du panneau ; à remplacer par un contexte d'ossature quand le kit en aura un
    if (forced === undefined) setStandalone(!ref.current?.closest('main')?.parentElement?.querySelector(':scope > .glass-panel'));
  }, [forced]);

  const retry = <Button variant="secondary" icon={RotateCcw} onClick={() => location.reload()}>Réessayer</Button>;

  if (standalone) {
    return (
      <>
        <StandaloneMessage title={TITLE} description={HINT} action={retry} />
        <ThemeToggle />
      </>
    );
  }
  // Dans le panneau : la carte d'état vide (EmptyState), à la largeur de colonne des écrans ; sans entrée à elle (la page en a une).
  return (
    <div ref={ref} className="max-w-[880px]">
      <div className="flex flex-col items-center rounded-box border border-line bg-glass px-6 py-16 text-center shadow-hi">
        {/* annoncée même sans changement de chemin (l'ossature ne déplace alors pas le focus) */}
        <div role="alert">
          <h1 className="text-title font-semibold tracking-[-0.015em] text-fg">{TITLE}</h1>
          <p className="mt-1.5 max-w-[46ch] text-body text-muted">{nb(HINT)}</p>
        </div>
        <div className="mt-5">{retry}</div>
      </div>
    </div>
  );
}
