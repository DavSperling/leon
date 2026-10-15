import { projectHref, viewHref } from '@/lib/tasks/task-links';
import type { ViewConfig } from '@/lib/tasks/view-config';
import type { ViewContext } from '@/lib/tasks/view-context';
import type { OpenView } from './list-context';
import { type MyTasksTab, myTasksTabs } from './my-tasks-tabs';
import { ViewControls } from './view-controls';
import type { ViewDialogKind } from './view-dialogs';
import { type ViewTab, ViewTabs } from './view-tabs';

// Une vue enregistrée, rangée dans le contexte (« Toutes », « Mes tâches », un projet) que ses filtres désignent.
export type SavedView = { id: string; name: string; context: ViewContext };

type TabsInput = {
  context: ViewContext;
  viewId: string | null; // la vue ouverte
  mineTab: Exclude<MyTasksTab, 'activity'> | null;
  views: SavedView[];
};

// Les onglets du contexte : son propre affichage (Toutes, ou Assignées / Créées / Activité pour
// « Mes tâches »), puis les vues enregistrées qui lui appartiennent.
export function buildTabs({ context, viewId, mineTab, views }: TabsInput): ViewTab[] {
  const saved = views
    .filter((view) => view.context === context)
    .map(({ id, name }) => ({ key: id, label: name, href: viewHref(id), current: id === viewId }));
  if (context === 'mine') return [...myTasksTabs(mineTab), ...saved];
  const href = context === 'all' ? '/taches' : projectHref(context.slice('project:'.length));
  return [{ key: 'default', label: 'Toutes', href, current: viewId === null }, ...saved];
}

type ViewBarProps = {
  view: OpenView | null;
  views: SavedView[];
  context: ViewContext;
  mineTab: TabsInput['mineTab'];
  config: ViewConfig;
  reference: ViewConfig;
  base: ViewConfig;
  modified: boolean;
  onDialog: (kind: ViewDialogKind) => void;
};

// La rangée sous l'en-tête : les onglets du contexte à gauche, les actions de la vue à droite.
// Sans vue enregistrée ni modification, une liste ordinaire n'a rien à y montrer.
export function ViewBar({ context, mineTab, views, ...controls }: ViewBarProps) {
  const tabs = buildTabs({ context, viewId: controls.view?.id ?? null, mineTab, views });
  const showTabs = context === 'mine' || tabs.length > 1;
  if (!showTabs && !controls.modified) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-5 pb-2">
      {showTabs && <ViewTabs label={context === 'mine' ? 'Mes tâches' : 'Vues'} tabs={tabs} />}
      <ViewControls {...controls} />
    </div>
  );
}
