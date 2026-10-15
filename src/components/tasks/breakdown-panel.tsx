'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatNumber } from '@/lib/format';
import type { ViewConfig } from '@/lib/tasks/view-config';
import { cn } from '@/lib/utils';
import type { Breakdown } from '@/server/tasks/task-list';
import { Avatar } from './avatar';
import {
  BREAKDOWN_TABS,
  type BreakdownEntry,
  type BreakdownIcon,
  breakdownEntries,
} from './breakdown-entries';
import { LabelDot } from './label-chip';
import type { ListContext } from './list-context';
import { PriorityIcon } from './priority-icon';
import { useViewNavigation } from './use-view-navigation';

function EntryIcon({ icon }: { icon: BreakdownIcon }) {
  switch (icon.kind) {
    case 'person':
      return <Avatar person={icon.person} />;
    case 'label':
      return <LabelDot color={icon.color} className="size-2.5" />;
    case 'priority':
      return <PriorityIcon priority={icon.priority} />;
    case 'project':
      return <span className="font-mono text-xs text-muted-foreground">{icon.key}</span>;
  }
}

type EntryListProps = { entries: BreakdownEntry[]; onSelect: (entry: BreakdownEntry) => void };

// Chaque valeur est un bouton à bascule : un clic filtre la liste, un second retire le filtre.
function EntryList({ entries, onSelect }: EntryListProps) {
  if (entries.length === 0) {
    return <p className="px-2 py-3 text-sm text-muted-foreground">Aucune tâche à répartir.</p>;
  }
  return (
    <ul className="space-y-0.5">
      {entries.map((entry) => (
        <li key={entry.key}>
          <button
            type="button"
            aria-pressed={entry.active}
            onClick={() => onSelect(entry)}
            className={cn(
              'flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50',
              entry.active && 'bg-primary-soft hover:bg-primary-soft',
            )}
          >
            <EntryIcon icon={entry.icon} />
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatNumber(entry.count)}
              <span className="sr-only"> {entry.count > 1 ? 'tâches' : 'tâche'}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

type BreakdownPanelProps = {
  breakdown: Breakdown;
  config: ViewConfig;
  base: ViewConfig;
  context: ListContext;
};

// Le panneau de répartition, à droite de la liste ou du tableau : combien de tâches par assigné,
// étiquette, priorité et projet, dans la vue telle qu'elle est filtrée. Un clic sur une valeur filtre.
export function BreakdownPanel({ breakdown, config, base, context }: BreakdownPanelProps) {
  const navigate = useViewNavigation(base);
  const entries = breakdownEntries(breakdown, config.filters, context);
  const select = ({ patch }: BreakdownEntry) =>
    navigate({ ...config, filters: { ...config.filters, ...patch } });
  return (
    <aside aria-label="Répartition des tâches" className="w-72 shrink-0 border-l">
      <Tabs defaultValue="assignee" className="sticky top-0 gap-3 p-3">
        <TabsList className="w-full">
          {BREAKDOWN_TABS.map(({ tab, label }) => (
            <TabsTrigger key={tab} value={tab} className="px-1 text-xs">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {BREAKDOWN_TABS.map(({ tab }) => (
          <TabsContent key={tab} value={tab}>
            <EntryList entries={entries[tab]} onSelect={select} />
          </TabsContent>
        ))}
      </Tabs>
    </aside>
  );
}
