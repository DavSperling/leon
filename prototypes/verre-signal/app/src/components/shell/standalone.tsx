import { type ReactNode, Suspense } from 'react';
import { Outlet } from 'react-router';
import { PageSkeleton } from '@/components/ui/feedback';
import { Toaster } from '@/components/ui/toast';
import { Aurora, ThinkingProvider } from './thinking';

/** Cadre des pages hors ossature (connexion, inscription, 404, erreur racine) : l'aurore, un <main>, les notifications. */
export function StandaloneShell({ children }: { children?: ReactNode }) {
  return (
    <ThinkingProvider>
      <Aurora />
      <main id="contenu" tabIndex={-1} className="relative z-[1] min-h-dvh outline-none">
        <Suspense fallback={<div className="mx-auto max-w-[360px] px-4 pt-[18vh]"><PageSkeleton /></div>}>{children ?? <Outlet />}</Suspense>
      </main>
      <Toaster />
    </ThinkingProvider>
  );
}
