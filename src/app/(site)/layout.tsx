import type { ReactNode } from 'react';
import { SiteShell } from '@/components/site/site-shell';

// Le site public : accueil (servi aussi sur « / » sans session, voir src/proxy.ts), cas d'usage, connecteurs, sécurité,
// tarifs et maquettes. Aucune page n'y lit la session : tout est statique.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
