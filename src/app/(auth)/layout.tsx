import type { ReactNode } from 'react';
import { StandaloneCard } from '@/components/verre/auth/standalone-card';
import { ThemeToggle } from '@/components/verre/auth/theme-toggle';
import { StandaloneShell } from '@/components/verre/shell';

// Commune à la connexion et à l'inscription : la carte reste en place quand on passe de l'une à l'autre.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <StandaloneShell>
      {/* Ancré en haut, pas centré : une erreur ou le passage à l'inscription allonge la carte vers le bas, rien au-dessus ne bouge. */}
      <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)] px-4 pt-[max(56px,calc(50dvh-310px))] pb-12">
        <StandaloneCard>{children}</StandaloneCard>
      </div>
      <ThemeToggle />
    </StandaloneShell>
  );
}
