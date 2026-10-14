import type { ReactNode } from 'react';
import { SidebarSections } from '@/components/sidebar-sections';
import { WorkspaceMenu } from '@/components/workspace-menu';

type AppShellProps = {
  organizationName: string;
  userName: string;
  userEmail: string;
  reviewCount: number;
  search?: ReactNode; // champ de recherche de la barre latérale (T19)
  tree?: ReactNode; // arbre des types, colonne de gauche du panneau (T19)
  children: ReactNode;
};

// Ossature de l'espace connecté : une barre latérale sur fond gris, puis un panneau blanc qui
// réunit l'arbre des fiches et la page lue. Sous 1024 px la page défile, sans tiroir.
export function AppShell({
  organizationName,
  userName,
  userEmail,
  reviewCount,
  search,
  tree,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-dvh min-w-5xl gap-2 bg-background p-2">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        Aller au contenu
      </a>
      <nav aria-label="Navigation principale" className="flex w-[232px] shrink-0 flex-col gap-4">
        <WorkspaceMenu
          organizationName={organizationName}
          userName={userName}
          userEmail={userEmail}
        />
        {search}
        <SidebarSections reviewCount={reviewCount} />
      </nav>
      <div className="flex min-w-0 flex-1 overflow-hidden rounded-xl border bg-card shadow-xs">
        <aside aria-label="Fiches" className="flex w-[288px] shrink-0 flex-col border-r bg-card">
          <p className="px-5 pt-4 pb-2 text-[15px] leading-5 text-muted-foreground">Mémoire</p>
          <div className="min-h-0 flex-1 overflow-y-auto pb-4">{tree}</div>
        </aside>
        <main id="contenu" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto scroll-smooth">
          {children}
        </main>
      </div>
    </div>
  );
}
