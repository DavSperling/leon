'use client';

import { X } from 'lucide-react';
import { DUE_FILTER_LABELS, PRIORITY_LABELS, STATUS_CATEGORY_LABELS } from '@/lib/tasks/labels';
import type { ViewConfig } from '@/lib/tasks/view-config';
import type { FilterPatch, ListContext } from './list-context';

export type FilterChip = { id: string; label: string; clear: FilterPatch };

const nameOf = (items: readonly { id: string; name: string }[], id: string): string =>
  items.find((item) => item.id === id)?.name ?? 'Inconnu';

const assigneeName = (assignee: string, members: ListContext['members']): string =>
  assignee === 'me' ? 'Moi' : assignee === 'none' ? 'Sans assigné' : nameOf(members, assignee);

// Un filtre actif par pastille ; `clear` est le changement qui le retire. Le filtre de statut
// vide (« tous ») n'en a pas.
export function activeFilters(config: ViewConfig, context: ListContext): FilterChip[] {
  const f = config.filters;
  const entries: Array<[string, string | false | null, FilterPatch]> = [
    [
      'statuses',
      f.statuses.length > 0 &&
        `Statut : ${f.statuses.map((category) => STATUS_CATEGORY_LABELS[category]).join(', ')}`,
      { statuses: [] },
    ],
    ['priority', f.priority && `Priorité : ${PRIORITY_LABELS[f.priority]}`, { priority: null }],
    [
      'assignee',
      f.assignee && `Assigné : ${assigneeName(f.assignee, context.members)}`,
      { assignee: null },
    ],
    ['creator', f.creator && 'Créateur : moi', { creator: null }],
    ['label', f.labelId && `Étiquette : ${nameOf(context.labels, f.labelId)}`, { labelId: null }],
    [
      'project',
      f.projectId && `Projet : ${nameOf(context.projects, f.projectId)}`,
      { projectId: null },
    ],
    ['due', f.due && `Échéance : ${DUE_FILTER_LABELS[f.due]}`, { due: null }],
    ['q', f.q.trim() !== '' && `Texte : « ${f.q.trim()} »`, { q: '' }],
  ];
  return entries.flatMap(([id, label, clear]) => (label ? [{ id, label, clear }] : []));
}

type FilterChipsProps = { chips: FilterChip[]; onClear: (patch: FilterPatch) => void };

export function FilterChips({ chips, onClear }: FilterChipsProps) {
  if (chips.length === 0) return null;
  return (
    <ul aria-label="Filtres actifs" className="flex flex-wrap gap-1.5 px-5 pb-2">
      {chips.map(({ id, label, clear }) => (
        <li
          key={id}
          className="inline-flex h-6 items-center rounded-full border bg-card pl-2.5 text-xs text-foreground-2"
        >
          {label}
          <button
            type="button"
            aria-label={`Retirer le filtre ${label}`}
            onClick={() => onClear(clear)}
            className="ml-0.5 flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X size={12} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
