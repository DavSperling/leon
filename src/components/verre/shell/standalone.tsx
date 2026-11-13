import type { ReactNode } from 'react';
import { ThinkingProvider } from './thinking';

/** Cadre des pages hors ossature (connexion, inscription, 404, erreur racine) : le bureau et un <main>. */
export function StandaloneShell({ children }: { children: ReactNode }) {
  return (
    <ThinkingProvider>
      <main id="contenu" tabIndex={-1} className="relative z-[1] min-h-dvh outline-none">
        {children}
      </main>
    </ThinkingProvider>
  );
}
