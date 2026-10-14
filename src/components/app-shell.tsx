import type { ReactNode } from 'react';
import { ShellFrame } from '@/components/shell-frame';
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
    <>
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        Aller au contenu
      </a>
      <ShellFrame
        rail={
          <nav aria-label="Navigation principale" className="flex flex-col gap-5">
            <WorkspaceMenu
              organizationName={organizationName}
              userName={userName}
              userEmail={userEmail}
            />
            {search}
            <SidebarSections reviewCount={reviewCount} />
          </nav>
        }
        panel={
          <div className="flex min-w-0 flex-1 overflow-hidden rounded-2xl border bg-card shadow-sm">
            <aside aria-label="Fiches" className="flex w-[300px] shrink-0 flex-col border-r">
              <p className="px-6 pt-5 pb-3 text-base text-muted-foreground">Mémoire partagée</p>
              <div className="min-h-0 flex-1 overflow-y-auto pb-4">{tree}</div>
            </aside>
            <main
              id="contenu"
              tabIndex={-1}
              className="relative min-w-0 flex-1 overflow-y-auto scroll-smooth"
            >
              {children}
            </main>
          </div>
        }
      />
    </>
  );
}
