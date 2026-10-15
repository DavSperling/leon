'use client';

import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { moveTaskAction, updateTaskAction } from '@/app/(taches)/taches/actions';
import type { TaskGroup } from '@/lib/tasks/group';
import type { ViewConfig } from '@/lib/tasks/view-config';
import type { TaskRow } from '@/server/tasks/task-row';
import {
  type Columns,
  changePatch,
  columnChange,
  type Drag,
  type Drop,
  dragOver,
  settle,
  shownChange,
  startDrag,
  toColumns,
} from './board-move';
import type { ListContext } from './list-context';
import { safely } from './safely';

// Le tableau que l'écran montre : les colonnes, et ce que le dépôt a changé sur chaque carte.
type Board = { columns: Columns; changes: Record<string, Partial<TaskRow>> };

// Envoie le dépôt au serveur et le montre tout de suite. Quand le serveur refuse, la transition se
// termine sans que les tâches aient changé : le tableau retrouve son état d'avant, avec l'erreur.
function useSaveDrop(
  board: Board,
  show: (next: Board) => void,
  config: ViewConfig,
  context: ListContext,
) {
  const [, startTransition] = useTransition();
  return (id: string, { columns, change, beforeId, afterId }: Drop) => {
    const changes = change
      ? { ...board.changes, [id]: shownChange(change, context) }
      : board.changes;
    startTransition(async () => {
      show({ columns, changes });
      // Hors du tri manuel, la place dans la colonne ne compte pas : seule la valeur change.
      const call =
        change && config.orderBy !== 'manual'
          ? updateTaskAction(id, changePatch(change))
          : moveTaskAction(id, { ...change, beforeId, afterId });
      const result = await safely(call);
      if (!result.ok) toast.error(result.error);
    });
  };
}

// L'état du tableau pendant qu'on glisse une carte : les colonnes que le glissement réarrange en direct,
// puis, au dépôt, le changement envoyé au serveur.
export function useBoardDrag(
  groups: TaskGroup<TaskRow>[],
  config: ViewConfig,
  context: ListContext,
) {
  const base = useMemo<Board>(() => ({ columns: toColumns(groups), changes: {} }), [groups]);
  const rows = useMemo(
    () => new Map(groups.flatMap((group) => group.rows).map((row) => [row.id, row])),
    [groups],
  );
  const [shown, show] = useOptimistic(base, (_current: Board, next: Board) => next);
  const [drag, setDrag] = useState<Drag | null>(null);
  const save = useSaveDrop(shown, show, config, context);

  const rowOf = (id: string): TaskRow | undefined => {
    const row = rows.get(id);
    const change = shown.changes[id];
    return row && change ? { ...row, ...change } : row;
  };
  const dragged = drag ? rows.get(drag.id) : undefined;

  const onDragStart = ({ active }: DragStartEvent) =>
    setDrag(startDrag(shown.columns, String(active.id)));

  // La carte change de colonne dès que le pointeur survole une autre ; elle se range avant la carte
  // survolée, ou après quand elle en a dépassé le milieu.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const after = (active.rect.current.translated?.top ?? 0) > over.rect.top + over.rect.height / 2;
    setDrag((current) => current && dragOver(current, String(over.id), after));
  };

  const onDragEnd = ({ over }: DragEndEvent) => {
    const current = drag;
    setDrag(null);
    const row = current && rows.get(current.id);
    if (!current || !row || !over) return;
    const drop = settle(current, String(over.id), config, row, context);
    if (drop) save(current.id, drop);
  };

  // Une colonne accepte la carte qu'on glisse si c'est sa colonne d'origine ou si la valeur qu'elle
  // représente (statut du projet de la tâche, priorité, assigné) peut lui être donnée.
  const accepts = (key: string): boolean =>
    !drag ||
    !dragged ||
    key === drag.from ||
    columnChange(config.groupBy, key, dragged, context) !== null;

  return {
    columns: drag?.columns ?? shown.columns,
    rowOf,
    draggedRow: drag ? rowOf(drag.id) : undefined,
    accepts,
    handlers: { onDragStart, onDragOver, onDragEnd, onDragCancel: () => setDrag(null) },
  };
}
