import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { ShellFrame } from '@/components/shell-frame';
import { SidebarSections } from '@/components/sidebar-sections';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WorkspaceMenu } from '@/components/workspace-menu';
import { isRailOpen, RAIL_COOKIE } from '@/lib/rail-cookie';

type AppShellProps = {
  organizationName: string;
  userName: string;
  userEmail: string;
  reviewCount: number;
  search?: ReactNode; // champ de recherche de la barre latérale (T19)
  column: ReactNode; // colonne de gauche du panneau : l'arbre des fiches, ou la navigation des tâches
  children: ReactNode;
};

// Ossature de l'espace connecté : une barre latérale sur fond gris, puis un panneau blanc qui
// réunit une colonne de navigation et la page lue. Sous 1024 px la page défile, sans tiroir.
export async function AppShell({
  organizationName,
  userName,
  userEmail,
  reviewCount,
  search,
  column,
  children,
}: AppShellProps) {
  const railOpen = isRailOpen((await cookies()).get(RAIL_COOKIE)?.value);
  return (
    <TooltipProvider delayDuration={300}>
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        Aller au contenu
      </a>
      <ShellFrame
        defaultRailOpen={railOpen}
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
            {column}
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
    </TooltipProvider>
  );
}
