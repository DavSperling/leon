import Link from 'next/link';
import type { ViewConfig } from '@/lib/tasks/view-config';
import { cn } from '@/lib/utils';

export type MyTasksTab = 'assigned' | 'created' | 'activity';

export const TABS: Array<{ tab: MyTasksTab; label: string; href: string }> = [
  { tab: 'assigned', label: 'Assignées', href: '/taches?assigne=moi' },
  { tab: 'created', label: 'Créées', href: '/taches?createur=moi' },
  { tab: 'activity', label: 'Activité', href: '/taches?onglet=activite' },
];

// L'onglet de « Mes tâches » que la liste montre, ou null quand la liste n'est pas « Mes tâches » :
// une vue enregistrée ou un projet filtré ont leur propre nom (listTitle).
export function myTasksTab(
  viewName: string | null,
  { filters }: Pick<ViewConfig, 'filters'>,
): Exclude<MyTasksTab, 'activity'> | null {
  if (viewName !== null || filters.projectId !== null) return null;
  if (filters.assignee === 'me') return 'assigned';
  return filters.creator === 'me' ? 'created' : null;
}

// Assignées, Créées, Activité : trois adresses, donc des liens (le retour arrière les retrouve).
export function MyTasksTabs({ active }: { active: MyTasksTab }) {
  return (
    <nav aria-label="Mes tâches" className="px-5 pb-2">
      <ul className="flex gap-1">
        {TABS.map(({ tab, label, href }) => (
          <li key={tab}>
            <Link
              href={href}
              aria-current={tab === active ? 'page' : undefined}
              className={cn(
                'flex h-7 items-center rounded-full px-3 text-sm text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
                tab === active && 'bg-accent font-medium text-foreground',
              )}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
