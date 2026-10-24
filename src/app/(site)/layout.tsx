import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SiteShell } from '@/components/site/site-shell';

// Le site public : accueil (servi aussi sur « / » sans session, voir src/proxy.ts), cas d'usage, connecteurs, sécurité,
// tarifs. Aucune page n'y lit la session : tout est statique.
// Adresse publique du site (BETTER_AUTH_URL, la même que l'authentification) : base des adresses canoniques.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'),
};

export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
