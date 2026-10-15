'use client';

import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';
import { updateTaskAction } from '@/app/(taches)/taches/actions';
import type { TaskRow } from '@/server/tasks/task-row';
import type { TaskPatch } from '@/server/tasks/tasks';
import { safely } from './safely';

// Un changement fait sur place : ce que le serveur reçoit, et ce que la ligne montre en attendant
// sa réponse. Une erreur remet la ligne dans son état d'avant et s'affiche.
export type TaskEdit<T extends { id: string } = TaskRow> = (
  patch: TaskPatch,
  shown: Partial<T>,
) => void;

// Une ligne de la liste, une carte, ou la page d'une tâche : tout ce qui porte un identifiant.
export function useTaskEdit<T extends { id: string }>(row: T): { row: T; edit: TaskEdit<T> } {
  const [shown, show] = useOptimistic(row, (current, change: Partial<T>) => ({
    ...current,
    ...change,
  }));
  const [, startTransition] = useTransition();
  const edit: TaskEdit<T> = (patch, change) =>
    startTransition(async () => {
      show(change);
      const result = await safely(updateTaskAction(row.id, patch));
      if (!result.ok) toast.error(result.error);
    });
  return { row: shown, edit };
}
