import type { ReactNode } from 'react';
import { SidebarSections } from '@/components/sidebar-sections';
import { TopBar } from '@/components/top-bar';

type AppShellProps = {
  organizationName: string;
  userName: string;
  userEmail: string;
  reviewCount: number;
  search?: ReactNode; // champ de recherche de la barre du haut (T19)
  tree?: ReactNode; // arbre des types de la barre latérale (T19)
  children: ReactNode;
};

// Ossature de l'espace connecté. Sous 1024 px la page défile, sans tiroir.
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
    <div className="flex h-dvh min-w-5xl flex-col">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        Aller au contenu
      </a>
      <TopBar
        organizationName={organizationName}
        userName={userName}
        userEmail={userEmail}
        search={search}
      />
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Navigation principale"
          className="flex w-[264px] shrink-0 flex-col border-r bg-muted"
        >
          <div className="min-h-0 flex-1 overflow-y-auto">{tree}</div>
          <SidebarSections reviewCount={reviewCount} />
        </nav>
        <main id="contenu" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto bg-card">
          {children}
        </main>
      </div>
    </div>
  );
}
