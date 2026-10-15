import { arrayMove } from '@dnd-kit/sortable';
import {
  TASK_PRIORITIES,
  type TaskPriority,
  type ViewGrouping,
  type ViewOrdering,
} from '@/lib/enums';
import type { TaskGroup } from '@/lib/tasks/group';
import type { TaskRow } from '@/server/tasks/task-row';
import type { TaskPatch } from '@/server/tasks/tasks';
import { type ListContext, shownStatus } from './list-context';

// Les colonnes du tableau : pour chacune, les tâches qu'elle contient dans l'ordre affiché.
export type Columns = Record<string, string[]>;

// Ce que ranger une tâche dans une colonne change sur elle, selon le regroupement.
export type ColumnChange =
  | { field: 'status'; value: string }
  | { field: 'priority'; value: TaskPriority }
  | { field: 'assignee'; value: string | null };

// Une tâche en cours de glissement : d'où elle part, et les colonnes telles qu'elle les réarrange.
export type Drag = { id: string; from: string; index: number; columns: Columns };

// Ce qu'un dépôt demande au serveur : le changement de colonne éventuel et les deux voisines.
export type Drop = {
  columns: Columns;
  change: ColumnChange | null; // nul : la tâche reste dans sa colonne
  beforeId: string | null; // la voisine du dessus
  afterId: string | null; // la voisine du dessous
};

type ChangeContext = Pick<ListContext, 'statuses' | 'members'>;

export const toColumns = (groups: readonly TaskGroup<{ id: string }>[]): Columns =>
  Object.fromEntries(groups.map((group) => [group.key, group.rows.map((row) => row.id)]));

// La colonne qui a cette clé, ou celle qui contient cette tâche.
export function columnOf(columns: Columns, id: string): string | undefined {
  if (Object.hasOwn(columns, id)) return id;
  return Object.keys(columns).find((key) => columns[key]?.includes(id));
}

// Glisser d'une colonne à l'autre change le statut, la priorité ou l'assigné ; pas les autres regroupements.
export const movesAcrossColumns = (groupBy: ViewGrouping): boolean =>
  groupBy === 'status' || groupBy === 'priority' || groupBy === 'assignee';

// Une tâche à plusieurs étiquettes figure dans plusieurs colonnes : on ne la glisse pas.
export function canDragCards(groupBy: ViewGrouping, orderBy: ViewOrdering): boolean {
  return groupBy !== 'label' && (orderBy === 'manual' || movesAcrossColumns(groupBy));
}

// Le changement qui range `row` dans la colonne `key` ; nul si la colonne ne le permet pas.
export function columnChange(
  groupBy: ViewGrouping,
  key: string,
  row: Pick<TaskRow, 'projectId'>,
  context: ChangeContext,
): ColumnChange | null {
  switch (groupBy) {
    case 'status': {
      // Les statuts sont ceux d'un projet : une tâche ne passe pas dans la colonne d'un autre.
      const own = context.statuses.some(
        (status) => status.id === key && status.projectId === row.projectId,
      );
      return own ? { field: 'status', value: key } : null;
    }
    case 'priority': {
      const priority = TASK_PRIORITIES.find((value) => value === key);
      return priority ? { field: 'priority', value: priority } : null;
    }
    case 'assignee': {
      if (key === 'none') return { field: 'assignee', value: null };
      return context.members.some((member) => member.id === key)
        ? { field: 'assignee', value: key }
        : null;
    }
    default:
      return null;
  }
}

// Ce que la carte montre une fois déposée, en attendant la réponse du serveur.
export function shownChange(change: ColumnChange, context: ChangeContext): Partial<TaskRow> {
  switch (change.field) {
    case 'status': {
      const status = context.statuses.find((candidate) => candidate.id === change.value);
      return status ? shownStatus(status) : {};
    }
    case 'priority':
      return { priority: change.value };
    case 'assignee':
      return { assignee: context.members.find((member) => member.id === change.value) ?? null };
  }
}

export function changePatch(change: ColumnChange): TaskPatch {
  switch (change.field) {
    case 'status':
      return { statusId: change.value };
    case 'priority':
      return { priority: change.value };
    case 'assignee':
      return { assigneeId: change.value };
  }
}

// Fait passer la tâche dans la colonne `to` : avant `overId`, après lui si `after`, en fin de colonne
// sans `overId`. Rend les mêmes colonnes (même référence) quand la tâche y est déjà.
export function moveToColumn(
  columns: Columns,
  id: string,
  to: string,
  overId: string | null,
  after: boolean,
): Columns {
  const from = columnOf(columns, id);
  const target = columns[to];
  if (from === undefined || from === to || target === undefined) return columns;
  const overIndex = overId === null ? -1 : target.indexOf(overId);
  const at = overIndex === -1 ? target.length : overIndex + (after ? 1 : 0);
  return {
    ...columns,
    [from]: (columns[from] ?? []).filter((candidate) => candidate !== id),
    [to]: [...target.slice(0, at), id, ...target.slice(at)],
  };
}

// Le glissement qui commence : la tâche, sa colonne et sa place d'origine ; nul si aucune colonne ne la contient.
export function startDrag(columns: Columns, id: string): Drag | null {
  const from = columnOf(columns, id);
  const index = from === undefined ? -1 : (columns[from]?.indexOf(id) ?? -1);
  return from === undefined ? null : { id, from, index, columns };
}

// La tâche glissée passe dans la colonne de ce qu'elle survole : une autre tâche, ou la colonne elle-même.
export function dragOver(drag: Drag, overId: string, after: boolean): Drag {
  const to = columnOf(drag.columns, overId);
  if (to === undefined) return drag;
  const overCard = Object.hasOwn(drag.columns, overId) ? null : overId;
  return { ...drag, columns: moveToColumn(drag.columns, drag.id, to, overCard, after) };
}

// Dépose la tâche à la place de `overId` quand c'est une autre tâche de sa colonne.
function reorder(columns: Columns, id: string, overId: string): Columns {
  const key = columnOf(columns, id);
  const ids = key === undefined ? undefined : columns[key];
  if (key === undefined || ids === undefined) return columns;
  const from = ids.indexOf(id);
  const to = ids.indexOf(overId);
  return to === -1 || to === from ? columns : { ...columns, [key]: arrayMove(ids, from, to) };
}

// Ce que le dépôt de `drag` sur `overId` change ; nul quand la tâche revient où elle était. Hors du tri
// manuel, l'ordre dans une colonne est celui du tri : seul un changement de colonne compte.
export function settle(
  drag: Drag,
  overId: string,
  config: { groupBy: ViewGrouping; orderBy: ViewOrdering },
  row: Pick<TaskRow, 'projectId'>,
  context: ChangeContext,
): Drop | null {
  const columns = reorder(drag.columns, drag.id, overId);
  const to = columnOf(columns, drag.id);
  const ids = to === undefined ? undefined : columns[to];
  if (to === undefined || ids === undefined) return null;
  const index = ids.indexOf(drag.id);
  const neighbors = { beforeId: ids[index - 1] ?? null, afterId: ids[index + 1] ?? null };
  if (to === drag.from) {
    const reordered = config.orderBy === 'manual' && index !== drag.index;
    return reordered ? { columns, change: null, ...neighbors } : null;
  }
  const change = columnChange(config.groupBy, to, row, context);
  return change ? { columns, change, ...neighbors } : null;
}
