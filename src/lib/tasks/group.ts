import {
  TASK_PRIORITIES,
  TASK_STATUS_CATEGORIES,
  type TaskPriority,
  type TaskStatusCategory,
  type ViewGrouping,
  type ViewOrdering,
} from '@/lib/enums';
import { EMPTY_GROUP_LABELS, PRIORITY_LABELS } from './labels';
import type { ViewConfig } from './view-config';

// Ce que le regroupement et le tri lisent d'une tâche : une `TaskRow` convient.
export type GroupableTask = {
  statusId: string;
  priority: TaskPriority;
  assignee: { id: string } | null;
  projectId: string | null;
  labels: readonly { id: string }[];
  position: number;
  dueDate: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// Tout ce qui peut donner un groupe, même vide ; les listes arrivent dans l'ordre voulu.
export type GroupContext = {
  statuses: readonly {
    id: string;
    label: string;
    category: TaskStatusCategory;
    position: number;
  }[];
  members: readonly { id: string; name: string }[];
  labels: readonly { id: string; name: string }[];
  projects: readonly { id: string; name: string }[];
};

type Status = GroupContext['statuses'][number];

export type TaskGroup<T> = { key: string; label: string; rows: T[] };

type Bucket = { key: string; label: string };
type Grouping = {
  buckets: Bucket[];
  keysOf: (row: GroupableTask) => string[];
  // Groupe des tâches sans valeur (clé 'none'), rangé en dernier ; absent si toute tâche a une valeur.
  noneLabel?: string;
};

const NONE_KEY = 'none';
const OTHER_KEY = 'other';
const OTHER_LABEL = 'Autre';

const byCategoryThenPosition = (a: Status, b: Status): number =>
  TASK_STATUS_CATEGORIES.indexOf(a.category) - TASK_STATUS_CATEGORIES.indexOf(b.category) ||
  a.position - b.position;

const GROUPINGS: Record<ViewGrouping, (context: GroupContext) => Grouping> = {
  status: (context) => ({
    buckets: [...context.statuses]
      .sort(byCategoryThenPosition)
      .map(({ id, label }) => ({ key: id, label })),
    keysOf: (row) => [row.statusId],
  }),
  priority: () => ({
    buckets: TASK_PRIORITIES.map((key) => ({ key, label: PRIORITY_LABELS[key] })),
    keysOf: (row) => [row.priority],
  }),
  assignee: (context) => ({
    buckets: context.members.map(({ id, name }) => ({ key: id, label: name })),
    keysOf: (row) => (row.assignee ? [row.assignee.id] : []),
    noneLabel: EMPTY_GROUP_LABELS.assignee,
  }),
  label: (context) => ({
    buckets: context.labels.map(({ id, name }) => ({ key: id, label: name })),
    keysOf: (row) => row.labels.map((label) => label.id),
    noneLabel: EMPTY_GROUP_LABELS.label,
  }),
  project: (context) => ({
    buckets: context.projects.map(({ id, name }) => ({ key: id, label: name })),
    keysOf: (row) => (row.projectId ? [row.projectId] : []),
    noneLabel: EMPTY_GROUP_LABELS.project,
  }),
  none: () => ({
    buckets: [{ key: 'all', label: 'Toutes les tâches' }],
    keysOf: () => ['all'],
  }),
};

// Échéance la plus proche d'abord, sans échéance en dernier.
function compareDue(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

const COMPARATORS: Record<ViewOrdering, (a: GroupableTask, b: GroupableTask) => number> = {
  manual: (a, b) => a.position - b.position,
  priority: (a, b) => TASK_PRIORITIES.indexOf(a.priority) - TASK_PRIORITIES.indexOf(b.priority),
  due_date: (a, b) => compareDue(a.dueDate, b.dueDate),
  created: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  updated: (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
};

// Tri selon `orderBy` ; à égalité, l'ordre manuel.
function sortTasks<T extends GroupableTask>(rows: readonly T[], orderBy: ViewOrdering): T[] {
  const compare = COMPARATORS[orderBy];
  return [...rows].sort((a, b) => compare(a, b) || a.position - b.position);
}

// Groupes dans l'ordre d'affichage, chacun trié selon `orderBy`. Une tâche à plusieurs étiquettes
// figure dans chaque groupe d'étiquette ; une valeur absente du contexte (créée entre deux lectures)
// rejoint un groupe « Autre » plutôt que de faire disparaître la tâche. Les groupes vides ne sont
// rendus qu'avec `showEmptyGroups`.
export function groupTasks<T extends GroupableTask>(
  rows: readonly T[],
  config: Pick<ViewConfig, 'groupBy' | 'orderBy' | 'showEmptyGroups'>,
  context: GroupContext,
): TaskGroup<T>[] {
  const grouping = GROUPINGS[config.groupBy](context);
  const groups = new Map<string, TaskGroup<T>>(
    grouping.buckets.map((bucket): [string, TaskGroup<T>] => [bucket.key, { ...bucket, rows: [] }]),
  );
  const other: TaskGroup<T> = { key: OTHER_KEY, label: OTHER_LABEL, rows: [] };
  const none: TaskGroup<T> = { key: NONE_KEY, label: grouping.noneLabel ?? '', rows: [] };

  for (const row of sortTasks(rows, config.orderBy)) {
    const keys = grouping.keysOf(row);
    if (keys.length === 0) none.rows.push(row);
    const known = keys.flatMap((key) => groups.get(key) ?? []);
    for (const group of known) group.rows.push(row);
    if (known.length < keys.length) other.rows.push(row);
  }

  const all = [
    ...groups.values(),
    ...(other.rows.length > 0 ? [other] : []),
    ...(grouping.noneLabel ? [none] : []),
  ];
  return config.showEmptyGroups ? all : all.filter((group) => group.rows.length > 0);
}
