'use client';

import { PanelRight, Plus, Search } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SEARCH_MAX_CHARS } from '@/lib/tasks/limits';
import type { ViewConfig } from '@/lib/tasks/view-config';
import { viewContextOf, viewStatus } from '@/lib/tasks/view-context';
import { cn } from '@/lib/utils';
import { useCreateTask } from './create-task-provider';
import { DisplayMenu } from './display-menu';
import { activeFilters, FilterChips } from './filter-chips';
import { FilterMenu } from './filter-menu';
import { ListBreadcrumb } from './list-breadcrumb';
import type { FilterPatch, ListContext, OpenView } from './list-context';
import { myTasksTab } from './my-tasks-tabs';
import { ShortcutHint } from './shortcut-hint';
import { useTaskShortcuts } from './use-task-shortcuts';
import { useViewNavigation } from './use-view-navigation';
import { type SavedView, ViewBar } from './view-bar';
import { type ViewDialogKind, ViewDialogs } from './view-dialogs';

// Le nom de la liste : celui de la vue ouverte, du projet filtré, de « Mes tâches », ou « Toutes ».
export function listTitle(viewName: string | null, config: ViewConfig, context: ListContext) {
  if (viewName) return viewName;
  const { projectId } = config.filters;
  if (projectId)
    return context.projects.find((project) => project.id === projectId)?.name ?? 'Projet';
  return myTasksTab(null, config) ? 'Mes tâches' : 'Toutes les tâches';
}

type SearchFieldProps = { query: string; onSearch: (text: string) => void };

// Entrée lance la recherche. Quand l'URL change d'ailleurs (pastille retirée), le champ suit.
function SearchField({ query, onSearch }: SearchFieldProps) {
  const id = useId();
  const [text, setText] = useState(query);
  const [seen, setSeen] = useState(query);
  if (query !== seen) {
    setSeen(query);
    setText(query);
  }
  return (
    <search className="relative">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSearch(text.trim());
        }}
      >
        <label htmlFor={id} className="sr-only">
          Rechercher dans les tâches
        </label>
        <Search
          size={14}
          strokeWidth={1.5}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={id}
          type="search"
          value={text}
          maxLength={SEARCH_MAX_CHARS}
          placeholder="Rechercher…"
          onChange={(event) => setText(event.target.value)}
          className="h-8 w-44 pl-8 text-sm"
        />
      </form>
    </search>
  );
}

type BreakdownToggleProps = { pressed: boolean; onToggle: () => void };

function BreakdownToggle({ pressed, onToggle }: BreakdownToggleProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Panneau de répartition"
          aria-pressed={pressed}
          onClick={onToggle}
          className={cn(pressed && 'bg-accent text-foreground')}
        >
          <PanelRight size={16} strokeWidth={1.5} aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Panneau de répartition</TooltipContent>
    </Tooltip>
  );
}

type ViewToolbarProps = {
  view: OpenView | null;
  views: SavedView[]; // toutes les vues enregistrées visibles ; la barre garde celles de son contexte
  config: ViewConfig;
  base: ViewConfig;
  context: ListContext;
};

// En-tête collant de la liste : fil d'Ariane, recherche, filtres, affichage, onglets et actions des
// vues enregistrées, puis les pastilles des filtres actifs. Chaque changement est une navigation
// (retour arrière compris).
export function ViewToolbar({ view, views, config, base, context }: ViewToolbarProps) {
  const navigate = useViewNavigation(base);
  const openCreate = useCreateTask();
  const [dialog, setDialog] = useState<ViewDialogKind | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  useTaskShortcuts({ filter: () => setFilterOpen(true) });
  const viewName = view?.name ?? null;
  const { reference, modified, isTeamDefault } = viewStatus(config, base, view);
  const change = (patch: Partial<ViewConfig>) => navigate({ ...config, ...patch });
  const filter = (patch: FilterPatch) => change({ filters: { ...config.filters, ...patch } });
  return (
    <div className="sticky top-0 z-10 border-b bg-card">
      <div className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 px-5 py-2">
        <ListBreadcrumb title={listTitle(viewName, config, context)} />
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <SearchField query={config.filters.q} onSearch={(q) => filter({ q })} />
          <FilterMenu
            config={config}
            context={context}
            onChange={filter}
            open={filterOpen}
            onOpenChange={setFilterOpen}
          />
          <DisplayMenu
            config={config}
            base={base}
            isTeamDefault={isTeamDefault}
            onChange={change}
            onSetTeamDefault={() => setDialog('default')}
          />
          <BreakdownToggle
            pressed={config.showBreakdown}
            onToggle={() => change({ showBreakdown: !config.showBreakdown })}
          />
          <ShortcutHint id="create">
            <Button size="sm" onClick={() => openCreate()} className="ml-1">
              <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
              Nouvelle tâche
            </Button>
          </ShortcutHint>
        </div>
      </div>
      <ViewBar
        view={view}
        views={views}
        context={viewContextOf(view ? base : config)}
        mineTab={myTasksTab(viewName, config)}
        config={config}
        reference={reference}
        base={base}
        modified={modified}
        onDialog={setDialog}
      />
      <FilterChips chips={activeFilters(config, context)} onClear={filter} />
      <ViewDialogs
        kind={dialog}
        view={view}
        config={config}
        modified={modified}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
