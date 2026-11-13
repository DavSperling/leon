import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { socialProviders } from '@/server/auth/auth';
import { GoogleOneTap } from './google-one-tap';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import './site.css';

/** Cadre du site public (accueil, produit, cas d'usage, connecteurs…) : une page blanche, l'en-tête, le pied. */
export function SiteShell({ children, footer = true }: { children: ReactNode; footer?: boolean }) {
  const t = useTranslations('site.shell');
  return (
    <div className="s-root">
      <a
        href="#contenu"
        className="fixed top-3 left-3 z-50 inline-flex min-h-10 -translate-y-20 items-center rounded-full bg-ink px-4 text-ui font-medium text-on-ink transition-transform focus-visible:translate-y-0"
      >
        {t('skip')}
      </a>
      <SiteHeader />
      {socialProviders.google && <GoogleOneTap clientId={socialProviders.google.clientId} />}
      {/* overflow-x-clip : un décor qui déborde (la pile, le bandeau qui défile) ne fait jamais défiler la page de côté. */}
      <main id="contenu" tabIndex={-1} className="min-h-dvh overflow-x-clip outline-none">
        {children}
      </main>
      {footer && <SiteFooter />}
    </div>
  );
}
