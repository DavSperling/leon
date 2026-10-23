import type { ReactNode } from 'react';
import { Aurora, ThinkingProvider } from '@/components/verre/shell/thinking';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import './site.css';
import './fx/fx.css';

/** Cadre du site public (accueil, cas d'usage, connecteurs…) et des pages de connexion : l'aurore, l'en-tête, le pied. */
export function SiteShell({ children, footer = true }: { children: ReactNode; footer?: boolean }) {
  return (
    <ThinkingProvider>
      <Aurora />
      <a
        href="#contenu"
        className="fixed top-3 left-3 z-50 -translate-y-20 rounded-full bg-accent px-4 py-2 text-ui font-semibold text-accent-ink transition-transform focus-visible:translate-y-0"
      >
        Aller au contenu
      </a>
      <SiteHeader />
      {/* z-[2] : au-dessus du pied (z-[1]) ; un élément fixe de la page (barre des maquettes) ne passe pas dessous */}
      <main id="contenu" tabIndex={-1} className="relative z-[2] min-h-dvh outline-none">
        {children}
      </main>
      {footer && (
        <div className="relative z-[1]">
          <SiteFooter />
        </div>
      )}
    </ThinkingProvider>
  );
}
