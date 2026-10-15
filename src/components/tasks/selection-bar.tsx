'use client';

import { Trash2, X } from 'lucide-react';
import { type ComponentProps, useTransition } from 'react';
import { toast } from 'sonner';
import { bulkUpdateTasksAction, deleteTasksAction } from '@/app/(taches)/taches/actions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatNumber } from '@/lib/format';
import type { TaskRow } from '@/server/tasks/task-row';
import type { BulkPatch } from '@/server/tasks/tasks';
import type { ListContext } from './list-context';
import { AssigneePicker } from './pickers/assignee-picker';
import { DueDatePicker } from './pickers/due-date-picker';
import { LabelsPicker } from './pickers/labels-picker';
import { PriorityPicker } from './pickers/priority-picker';
import { StatusPicker } from './pickers/status-picker';
import { safely } from './safely';
import { commonValue } from './selection';
import { useSelection } from './selection-provider';

const tasksLabel = (count: number): string =>
  `${formatNumber(count)} ${count > 1 ? 'tâches' : 'tâche'}`;

type BarProps = { rows: TaskRow[]; context: ListContext; now: Date };
type EditProps = { edit: (patch: BulkPatch) => void; pending: boolean };

function BarButton(props: ComponentProps<typeof Button>) {
  return <Button type="button" variant="ghost" size="sm" {...props} />;
}

// Les statuts sont ceux d'un projet : une sélection de plusieurs projets n'en a pas de commun.
function StatusAction({ rows, context, edit, pending }: BarProps & EditProps) {
  const projectIds = new Set(rows.map((row) => row.projectId));
  const [projectId] = projectIds;
  if (projectIds.size !== 1) {
    return (
      <BarButton
        disabled
        aria-label="Statut (indisponible : les tâches sont de projets différents)"
        title="Les tâches sélectionnées sont de projets différents."
      >
        Statut
      </BarButton>
    );
  }
  return (
    <StatusPicker
      statuses={context.statuses.filter((status) => status.projectId === projectId)}
      value={commonValue(rows, (row) => row.statusId)}
      onChange={(statusId) => edit({ statusId })}
    >
      <BarButton disabled={pending}>Statut</BarButton>
    </StatusPicker>
  );
}

// Une étiquette est cochée quand toutes les tâches la portent ; la cocher l'ajoute à toutes, la
// décocher la retire de toutes.
function LabelsAction({ rows, context, edit, pending }: BarProps & EditProps) {
  const onAll = context.labels
    .filter((label) => rows.every((row) => row.labels.some((own) => own.id === label.id)))
    .map((label) => label.id);
  return (
    <LabelsPicker
      labels={context.labels}
      value={onAll}
      onToggle={(label, selected) =>
        edit(selected ? { addLabelIds: [label.id] } : { removeLabelIds: [label.id] })
      }
    >
      <BarButton disabled={pending}>Étiquettes</BarButton>
    </LabelsPicker>
  );
}

type DeleteProps = { rows: TaskRow[]; pending: boolean; onConfirm: () => void };

function DeleteAction({ rows, pending, onConfirm }: DeleteProps) {
  const these = rows.length > 1 ? 'ces tâches' : 'cette tâche';
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <BarButton disabled={pending} className="text-destructive hover:text-destructive">
          Supprimer
        </BarButton>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer {tasksLabel(rows.length)} ?</AlertDialogTitle>
          <AlertDialogDescription>
            Les commentaires et l&apos;historique de {these} sont supprimés avec elle
            {rows.length > 1 ? 's' : ''}. Les sous-tâches restent, sans parent. Cette action est
            définitive.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type BulkActions = EditProps & { remove: () => void };

// Les actions groupées : une transition à la fois, qui désactive la barre jusqu'à ce que la liste
// ait fini de se rafraîchir. Une erreur s'affiche ; la sélection reste, pour réessayer.
function useBulkActions(rows: TaskRow[]): BulkActions {
  const { clear } = useSelection();
  const [pending, startTransition] = useTransition();
  const ids = rows.map((row) => row.id);
  const edit = (patch: BulkPatch) =>
    startTransition(async () => {
      const result = await safely(bulkUpdateTasksAction(ids, patch));
      if (!result.ok) toast.error(result.error);
    });
  const remove = () =>
    startTransition(async () => {
      const result = await safely(deleteTasksAction(ids));
      if (!result.ok) return void toast.error(result.error);
      clear();
      toast.success(
        `${tasksLabel(result.count)} ${result.count > 1 ? 'supprimées' : 'supprimée'}.`,
      );
    });
  return { edit, pending, remove };
}

// La barre flottante en bas de la liste : le nombre de tâches cochées et ce qu'on peut leur
// faire d'un coup. Elle colle au bas de la zone qui défile.
export function SelectionBar({ context, now }: { context: ListContext; now: Date }) {
  const { selectedRows: rows, clear } = useSelection();
  const { edit, pending, remove } = useBulkActions(rows);
  if (rows.length === 0) return null;
  const bar = { rows, context, now };
  return (
    <div className="pointer-events-none sticky bottom-4 z-10 flex justify-center px-5">
      <div
        role="toolbar"
        aria-label="Actions groupées"
        aria-busy={pending}
        className="pointer-events-auto flex max-w-full flex-wrap items-center gap-0.5 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg"
      >
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Vider la sélection"
          onClick={clear}
          disabled={pending}
        >
          <X size={14} strokeWidth={1.5} aria-hidden="true" />
        </Button>
        <span aria-live="polite" className="px-2 text-sm tabular-nums">
          {formatNumber(rows.length)} {rows.length > 1 ? 'sélectionnées' : 'sélectionnée'}
        </span>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <StatusAction {...bar} edit={edit} pending={pending} />
        <PriorityPicker
          value={commonValue(rows, (row) => row.priority)}
          onChange={(priority) => edit({ priority })}
        >
          <BarButton disabled={pending}>Priorité</BarButton>
        </PriorityPicker>
        <AssigneePicker
          members={context.members}
          viewerId={context.viewerId}
          value={commonValue(rows, (row) => row.assignee?.id ?? null)}
          onChange={(assigneeId) => edit({ assigneeId })}
        >
          <BarButton disabled={pending}>Assigné</BarButton>
        </AssigneePicker>
        <LabelsAction {...bar} edit={edit} pending={pending} />
        <DueDatePicker
          value={commonValue(rows, (row) => row.dueDate)}
          now={now}
          onChange={(dueDate) => edit({ dueDate })}
        >
          <BarButton disabled={pending}>Échéance</BarButton>
        </DueDatePicker>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <DeleteAction rows={rows} pending={pending} onConfirm={remove} />
      </div>
    </div>
  );
}
