import type { ReactNode } from 'react';
import { AuthAside } from '@/components/site/auth-aside';
import { SiteShell } from '@/components/site/site-shell';
import { GlassCard } from '@/components/verre/ui/surfaces';

// Commune à la connexion et à l'inscription : l'en-tête du site, la carte du formulaire à gauche (elle reste en place
// quand on passe de l'une à l'autre), le panneau de Leon à droite. Ancré en haut, pas centré : une erreur ou le passage
// à l'inscription allonge la carte vers le bas, rien au-dessus ne bouge.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <SiteShell footer={false}>
      <div className="mx-auto grid min-h-dvh w-full max-w-[1200px] grid-cols-[minmax(0,1fr)] content-start gap-10 px-4 pt-28 pb-16 sm:px-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-20 lg:pt-[max(132px,calc(50dvh-300px))]">
        <div className="rise-in mx-auto w-full max-w-[420px]">
          <GlassCard
            variant="raised"
            signal
            className="p-6 shadow-panel backdrop-blur-[30px] sm:p-8"
          >
            <div className="relative z-[1]">{children}</div>
          </GlassCard>
        </div>
        <AuthAside />
      </div>
    </SiteShell>
  );
}
