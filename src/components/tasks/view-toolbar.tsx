'use client';

import { PanelRight, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ViewConfig } from '@/lib/tasks/view-config';
import { cn } from '@/lib/utils';
import { useCreateTask } from './create-task-provider';
import { DisplayMenu } from './display-menu';
import { activeFilters, FilterChips } from './filter-chips';
import { FilterMenu } from './filter-menu';
import type { FilterPatch, ListContext } from './list-context';
import { useViewNavigation } from './use-view-navigation';

// Le nom de la liste : celui de la vue ouverte, du projet filtré, de « Mes tâches », ou « Toutes ».
export function listTitle(viewName: string | null, config: ViewConfig, context: ListContext) {
  if (viewName) return viewName;
  const { projectId, assignee, creator } = config.filters;
  if (projectId)
    return context.projects.find((project) => project.id === projectId)?.name ?? 'Projet';
  return assignee === 'me' || creator === 'me' ? 'Mes tâches' : 'Toutes les tâches';
}

// Longueur maximale de `q` dans l'URL (C4) : au-delà, la page ignorerait la recherche.
const MAX_QUERY_CHARS = 100;

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
          maxLength={MAX_QUERY_CHARS}
          placeholder="Rechercher…"
          onChange={(event) => setText(event.target.value)}
          className="h-8 w-44 pl-8 text-sm"
        />
      </form>
    </search>
  );
}

type ViewToolbarProps = {
  viewName: string | null; // vue enregistrée ouverte
  config: ViewConfig;
  base: ViewConfig;
  context: ListContext;
};

// En-tête collant de la liste : fil d'Ariane, recherche, filtres, affichage, puis les pastilles
// des filtres actifs. Chaque changement est une navigation (retour arrière compris).
export function ViewToolbar({ viewName, config, base, context }: ViewToolbarProps) {
  const navigate = useViewNavigation(base);
  const openCreate = useCreateTask();
  const change = (patch: Partial<ViewConfig>) => navigate({ ...config, ...patch });
  const filter = (patch: FilterPatch) => change({ filters: { ...config.filters, ...patch } });
  return (
    <div className="sticky top-0 z-10 border-b bg-card">
      <div className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 px-5 py-2">
        <Breadcrumb>
          <BreadcrumbList className="gap-1.5 sm:gap-1.5">
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/taches">Tâches</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <h1 aria-current="page" className="text-sm font-medium text-foreground">
                {listTitle(viewName, config, context)}
              </h1>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <SearchField query={config.filters.q} onSearch={(q) => filter({ q })} />
          <FilterMenu config={config} context={context} onChange={filter} />
          <DisplayMenu config={config} base={base} onChange={change} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Panneau de répartition"
                aria-pressed={config.showBreakdown}
                onClick={() => change({ showBreakdown: !config.showBreakdown })}
                className={cn(config.showBreakdown && 'bg-accent text-foreground')}
              >
                <PanelRight size={16} strokeWidth={1.5} aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Panneau de répartition</TooltipContent>
          </Tooltip>
          <Button size="sm" aria-keyshortcuts="C" onClick={() => openCreate()} className="ml-1">
            <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
            Nouvelle tâche
          </Button>
        </div>
      </div>
      <FilterChips chips={activeFilters(config, context)} onClear={filter} />
    </div>
  );
}
