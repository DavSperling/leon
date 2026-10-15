'use client';

import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';
import { updateTaskAction } from '@/app/(taches)/taches/actions';
import type { TaskRow } from '@/server/tasks/task-row';
import type { TaskPatch } from '@/server/tasks/tasks';
import { safely } from './safely';

// Un changement fait sur place : ce que le serveur reçoit, et ce que la ligne montre en attendant
// sa réponse. Une erreur remet la ligne dans son état d'avant et s'affiche.
export type TaskEdit = (patch: TaskPatch, shown: Partial<TaskRow>) => void;

export function useTaskEdit(row: TaskRow): { row: TaskRow; edit: TaskEdit } {
  const [shown, show] = useOptimistic(row, (current, change: Partial<TaskRow>) => ({
    ...current,
    ...change,
  }));
  const [, startTransition] = useTransition();
  const edit: TaskEdit = (patch, change) =>
    startTransition(async () => {
      show(change);
      const result = await safely(updateTaskAction(row.id, patch));
      if (!result.ok) toast.error(result.error);
    });
  return { row: shown, edit };
}
