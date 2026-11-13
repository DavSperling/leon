'use client';

import type { ReactNode } from 'react';
import { Brand } from '@/components/verre/shell/brand';
import { GlassCard } from '@/components/verre/ui/surfaces';
import { nb } from '@/lib/verre/nb';

/** La marque et la feuille des pages hors ossature (404, erreur racine) ; la connexion et l'inscription ont leur mise en page dans src/app/(auth)/layout.tsx. */
export function StandaloneCard({ children }: { children: ReactNode }) {
  // entrée en CSS (.rise-in) : rendue par le serveur, la carte reste visible sans JavaScript
  return (
    <div className="rise-in mx-auto w-full max-w-[392px]">
      <div className="flex h-9 items-center">
        <Brand />
      </div>
      <GlassCard className="mt-5 p-6 shadow-lift sm:p-7">{children}</GlassCard>
    </div>
  );
}

/** Page système seule sur le bureau (404, erreur racine) : un titre court, une phrase au besoin, un seul bouton. */
export function StandaloneMessage({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)] place-items-center bg-desk px-4 py-14">
      <StandaloneCard>
        <h1 className="text-h2 font-semibold tracking-[-0.018em] text-fg">{nb(title)}</h1>
        {description && <p className="mt-2 text-body text-muted">{nb(description)}</p>}
        <div className="mt-6">{action}</div>
      </StandaloneCard>
    </div>
  );
}
