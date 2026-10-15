import type { TaskPriority } from '@/lib/enums';
import { PRIORITY_LABELS } from '@/lib/tasks/labels';
import type { ViewConfig } from '@/lib/tasks/view-config';
import type { Breakdown } from '@/server/tasks/task-list';
import type { FilterPatch, ListContext } from './list-context';

export type BreakdownTab = 'assignee' | 'label' | 'priority' | 'project';

export const BREAKDOWN_TABS: Array<{ tab: BreakdownTab; label: string }> = [
  { tab: 'assignee', label: 'Assignés' },
  { tab: 'label', label: 'Étiquettes' },
  { tab: 'priority', label: 'Priorité' },
  { tab: 'project', label: 'Projets' },
];

// Ce qui précède le nom d'une valeur : l'avatar d'un assigné (null : sans assigné), le point d'une
// étiquette, l'icône d'une priorité, la clé d'un projet.
export type BreakdownIcon =
  | { kind: 'person'; person: { name: string; initials: string } | null }
  | { kind: 'label'; color: string }
  | { kind: 'priority'; priority: TaskPriority }
  | { kind: 'project'; key: string };

// Une ligne du panneau : `patch` est le filtre qu'un clic pose, ou retire quand la ligne est déjà active.
export type BreakdownEntry = {
  key: string;
  label: string;
  count: number;
  active: boolean;
  icon: BreakdownIcon;
  patch: FilterPatch;
};

type Filters = ViewConfig['filters'];

function assigneeEntries(rows: Breakdown['assignee'], filters: Filters, context: ListContext) {
  return rows.map(({ id, count }): BreakdownEntry => {
    const member = context.members.find((candidate) => candidate.id === id);
    const value = id ?? 'none';
    const active =
      filters.assignee === value || (id === context.viewerId && filters.assignee === 'me');
    const label = id === null ? 'Sans assigné' : (member?.name ?? 'Ancien membre');
    const person = id === null ? null : (member ?? { name: label, initials: '?' });
    return {
      key: value,
      label,
      count,
      active,
      icon: { kind: 'person', person },
      patch: { assignee: active ? null : value },
    };
  });
}

function labelEntries(rows: Breakdown['label'], filters: Filters, context: ListContext) {
  return rows.flatMap(({ id, count }): BreakdownEntry[] => {
    const label = context.labels.find((candidate) => candidate.id === id);
    if (!label) return [];
    const active = filters.labelId === id;
    const icon = { kind: 'label', color: label.color } as const;
    return [
      { key: id, label: label.name, count, active, icon, patch: { labelId: active ? null : id } },
    ];
  });
}

function priorityEntries(rows: Breakdown['priority'], filters: Filters) {
  return rows.map(({ value, count }): BreakdownEntry => {
    const active = filters.priority === value;
    const icon = { kind: 'priority', priority: value } as const;
    const patch = { priority: active ? null : value };
    return { key: value, label: PRIORITY_LABELS[value], count, active, icon, patch };
  });
}

function projectEntries(rows: Breakdown['project'], filters: Filters, context: ListContext) {
  return rows.flatMap(({ id, count }): BreakdownEntry[] => {
    const project = context.projects.find((candidate) => candidate.id === id);
    if (!project) return [];
    const active = filters.projectId === id;
    const icon = { kind: 'project', key: project.key } as const;
    return [
      {
        key: id,
        label: project.name,
        count,
        active,
        icon,
        patch: { projectId: active ? null : id },
      },
    ];
  });
}

// Les quatre onglets du panneau de répartition. Les comptes sont ceux de la vue : filtres compris.
export function breakdownEntries(
  breakdown: Breakdown,
  filters: Filters,
  context: ListContext,
): Record<BreakdownTab, BreakdownEntry[]> {
  return {
    assignee: assigneeEntries(breakdown.assignee, filters, context),
    label: labelEntries(breakdown.label, filters, context),
    priority: priorityEntries(breakdown.priority, filters),
    project: projectEntries(breakdown.project, filters, context),
  };
}
