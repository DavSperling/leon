import type { ViewConfig } from '@/lib/tasks/view-config';
import { type ViewTab, ViewTabs } from './view-tabs';

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

// `active` : l'onglet courant, ou null quand c'est une vue enregistrée qui est ouverte.
export function myTasksTabs(active: MyTasksTab | null): ViewTab[] {
  return TABS.map(({ tab, label, href }) => ({ key: tab, label, href, current: tab === active }));
}

// Assignées, Créées, Activité : trois adresses, donc des liens (le retour arrière les retrouve).
export function MyTasksTabs({ active }: { active: MyTasksTab }) {
  return <ViewTabs label="Mes tâches" tabs={myTasksTabs(active)} className="px-5 pb-2" />;
}
