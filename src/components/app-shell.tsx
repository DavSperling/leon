import type { ReactNode } from 'react';
import { ShellFrame } from '@/components/shell-frame';
import { SidebarSections } from '@/components/sidebar-sections';
import { WorkspaceMenu } from '@/components/workspace-menu';

type AppShellProps = {
  organizationName: string;
  userName: string;
  userEmail: string;
  search?: ReactNode; // champ de recherche de la barre latérale
  children: ReactNode;
};

// Ossature de l'espace connecté : une barre latérale sur le fond gris, puis la page, blanche, qui
// porte ce qu'on lit. Sous 1024 px la page défile, sans tiroir.
export function AppShell({
  organizationName,
  userName,
  userEmail,
  search,
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
          <nav aria-label="Navigation principale" className="flex min-h-0 flex-1 flex-col gap-4">
            <WorkspaceMenu
              organizationName={organizationName}
              userName={userName}
              userEmail={userEmail}
            />
            {search}
            <SidebarSections />
          </nav>
        }
        panel={
          <main
            id="contenu"
            tabIndex={-1}
            className="relative min-w-0 flex-1 overflow-y-auto scroll-smooth"
          >
            {children}
          </main>
        }
      />
    </>
  );
}
