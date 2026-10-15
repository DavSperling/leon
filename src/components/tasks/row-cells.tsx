'use client';

import { CalendarPlus, Tag } from 'lucide-react';
import { formatDue, isOverdue } from '@/lib/tasks/dates';
import { PRIORITY_LABELS } from '@/lib/tasks/labels';
import { cn } from '@/lib/utils';
import type { TaskRow } from '@/server/tasks/task-row';
import { Avatar } from './avatar';
import { LabelChip } from './label-chip';
import type { ListContext } from './list-context';
import { AssigneePicker } from './pickers/assignee-picker';
import { DueDatePicker } from './pickers/due-date-picker';
import { LabelsPicker } from './pickers/labels-picker';
import { PriorityPicker } from './pickers/priority-picker';
import { StatusPicker } from './pickers/status-picker';
import { PriorityIcon } from './priority-icon';
import { StatusIcon } from './status-icon';
import type { TaskEdit } from './use-task-edit';

// Les cellules d'une ligne qu'un clic ouvre sur son sélecteur. Elles passent au-dessus du lien
// qui couvre la ligne (relative z-10), et font au moins 24 px de côté.
const CELL =
  'relative z-10 flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-accent';
// Une cellule encore vide ne se montre qu'au survol, au focus et quand son menu est ouvert.
const FAINT =
  'text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100';

export function PriorityCell({ row, edit }: { row: TaskRow; edit: TaskEdit }) {
  return (
    <PriorityPicker value={row.priority} onChange={(priority) => edit({ priority }, { priority })}>
      <button
        type="button"
        aria-label={`Priorité : ${PRIORITY_LABELS[row.priority]}`}
        className={cn(CELL, '-ml-1')}
      >
        <PriorityIcon priority={row.priority} />
      </button>
    </PriorityPicker>
  );
}

type StatusCellProps = { row: TaskRow; statuses: ListContext['statuses']; edit: TaskEdit };

export function StatusCell({ row, statuses, edit }: StatusCellProps) {
  const own = statuses.filter((status) => status.projectId === row.projectId);
  const change = (statusId: string) => {
    const status = own.find((candidate) => candidate.id === statusId);
    if (!status) return;
    edit(
      { statusId },
      {
        statusId,
        statusLabel: status.label,
        statusColor: status.color,
        statusCategory: status.category,
      },
    );
  };
  return (
    <StatusPicker statuses={own} value={row.statusId} onChange={change}>
      <button type="button" aria-label={`Statut : ${row.statusLabel}`} className={CELL}>
        <StatusIcon category={row.statusCategory} color={row.statusColor} />
      </button>
    </StatusPicker>
  );
}

type AssigneeCellProps = { row: TaskRow; context: ListContext; edit: TaskEdit };

export function AssigneeCell({ row, context, edit }: AssigneeCellProps) {
  const change = (assigneeId: string | null) =>
    edit({ assigneeId }, { assignee: context.members.find((m) => m.id === assigneeId) ?? null });
  return (
    <AssigneePicker
      members={context.members}
      viewerId={context.viewerId}
      value={row.assignee?.id ?? null}
      onChange={change}
    >
      <button
        type="button"
        aria-label={`Assigné : ${row.assignee?.name ?? 'personne'}`}
        className={CELL}
      >
        <Avatar person={row.assignee} />
      </button>
    </AssigneePicker>
  );
}

type LabelsCellProps = { row: TaskRow; labels: ListContext['labels']; edit: TaskEdit };

const MAX_LABELS = 2;

export function LabelsCell({ row, labels, edit }: LabelsCellProps) {
  const toggle = (label: ListContext['labels'][number], selected: boolean) =>
    edit(selected ? { addLabelIds: [label.id] } : { removeLabelIds: [label.id] }, {
      labels: selected
        ? [...row.labels, label]
        : row.labels.filter((candidate) => candidate.id !== label.id),
    });
  const hidden = row.labels.slice(MAX_LABELS);
  return (
    <LabelsPicker labels={labels} value={row.labels.map((label) => label.id)} onToggle={toggle}>
      <button
        type="button"
        aria-label={`Étiquettes : ${row.labels.map((label) => label.name).join(', ') || 'aucune'}`}
        className={cn(CELL, 'hidden gap-1 @2xl:flex', row.labels.length > 0 ? 'px-1' : FAINT)}
      >
        {row.labels.length === 0 && <Tag size={14} strokeWidth={1.5} aria-hidden="true" />}
        {row.labels.slice(0, MAX_LABELS).map((label) => (
          <LabelChip key={label.id} label={label} />
        ))}
        {hidden.length > 0 && (
          <span className="text-xs text-muted-foreground">+{hidden.length}</span>
        )}
      </button>
    </LabelsPicker>
  );
}

export function DueCell({ row, now, edit }: { row: TaskRow; now: Date; edit: TaskEdit }) {
  const overdue = isOverdue(row, now);
  const label = row.dueDate ? formatDue(row.dueDate, now) : 'aucune';
  return (
    <DueDatePicker
      value={row.dueDate}
      now={now}
      onChange={(dueDate) => edit({ dueDate }, { dueDate })}
    >
      <button
        type="button"
        aria-label={`Échéance : ${label}${overdue ? ' (en retard)' : ''}`}
        className={cn(
          CELL,
          'w-[5.5rem] justify-end px-1.5 text-xs tabular-nums',
          row.dueDate ? 'text-muted-foreground' : FAINT,
          overdue && 'text-destructive',
        )}
      >
        {row.dueDate ? label : <CalendarPlus size={14} strokeWidth={1.5} aria-hidden="true" />}
      </button>
    </DueDatePicker>
  );
}
