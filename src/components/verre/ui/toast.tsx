'use client';

import { Toaster as SonnerToaster, toast as sonner } from 'sonner';
import { nb } from '@/lib/verre/nb';

// Notifications : sonner, en pastille d'encre au bas de l'écran, centrée, au-dessus d'un panneau ouvert. Pour ce qui
// s'est passé ailleurs sur la page ou ne se voit pas sur place : ce qui se voit sur place (un bouton, une ligne) le
// dit sur place. Un seul <Toaster />, monté dans src/app/layout.tsx. Une erreur reste 8 s au lieu de 4 ; trois au plus.

/** toast('Copié.') ; toast.success('Jeton révoqué.') ; toast.error('Impossible de révoquer. Réessayez.') (8 s, un point rouge) */
export const toast = Object.assign(
  (message: string, duration?: number) => sonner(nb(message), { duration }),
  {
    success: (message: string, duration?: number) => sonner(nb(message), { duration }),
    error: (message: string, duration = 8000) =>
      sonner(nb(message), {
        duration,
        icon: <span aria-hidden="true" className="block size-1.5 rounded-full bg-on-ink-danger" />,
      }),
    dismiss: sonner.dismiss,
  },
);

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      // des pastilles de largeurs différentes ne s'empilent pas l'une derrière l'autre : elles se suivent
      expand
      gap={8}
      visibleToasts={3}
      duration={4000}
      offset={24}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'left-1/2 flex w-max max-w-[min(560px,calc(100vw-32px))] -translate-x-1/2 items-center gap-2.5 rounded-full bg-ink px-4 py-[11px] text-ui leading-[1.3] font-medium text-on-ink shadow-float',
          icon: 'shrink-0',
          title: 'min-w-0',
        },
      }}
    />
  );
}
