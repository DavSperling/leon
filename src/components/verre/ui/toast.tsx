'use client';

import { CircleCheck, CircleX, Info } from 'lucide-react';
import { Toaster as SonnerToaster, toast as sonner } from 'sonner';
import { nb } from '@/lib/verre/nb';
import { useTheme } from '@/lib/verre/theme';

// Notifications : sonner (déjà en place dans l'appli), au rendu de la maquette. toast('Copié.') depuis n'importe où ;
// un seul <Toaster />, monté dans src/app/layout.tsx. Une erreur reste 8 s au lieu de 4 ; trois au plus à l'écran.

/** toast('Copié.') ; toast.success('Jeton révoqué.') ; toast.error('Impossible de révoquer. Réessayez.') (8 s) */
export const toast = Object.assign(
  (message: string, duration?: number) => sonner.info(nb(message), { duration }),
  {
    success: (message: string, duration?: number) => sonner.success(nb(message), { duration }),
    error: (message: string, duration = 8000) => sonner.error(nb(message), { duration }),
    dismiss: sonner.dismiss,
  },
);

export function Toaster() {
  const { theme } = useTheme();
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      visibleToasts={3}
      duration={4000}
      icons={{
        info: <Info aria-hidden="true" strokeWidth={1.8} className="size-4 text-accent" />,
        success: (
          <CircleCheck aria-hidden="true" strokeWidth={1.8} className="size-4 text-success" />
        ),
        error: <CircleX aria-hidden="true" strokeWidth={1.8} className="size-4 text-destructive" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'glass-float flex w-full max-w-[380px] items-start gap-3 rounded-card border border-line-strong py-3 pr-3 pl-3.5 text-ui text-fg shadow-float',
          icon: 'mt-[2px] shrink-0',
          title: 'min-w-0 flex-1 py-px font-normal',
        },
      }}
    />
  );
}
