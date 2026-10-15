import { ListTree } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ViewProperty } from '@/lib/enums';
import { formatDate, formatRelative } from '@/lib/format';
import { formatDue, isOverdue } from '@/lib/tasks/dates';
import { cn } from '@/lib/utils';
import type { TaskRow } from '@/server/tasks/task-row';
import { Avatar } from './avatar';
import { LabelChip } from './label-chip';
import { PriorityIcon } from './priority-icon';
import { StatusIcon } from './status-icon';
import { TaskTitle } from './task-title';

const MAX_LABELS = 2;

// Une date d'information, avec son intitulé pour les lecteurs d'écran.
function DateCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground @3xl:block">
      <span className="sr-only">{label} </span>
      {children}
    </span>
  );
}

function Labels({ labels }: { labels: TaskRow['labels'] }) {
  const hidden = labels.slice(MAX_LABELS);
  return (
    <span className="hidden shrink-0 items-center gap-1 @2xl:flex">
      {labels.slice(0, MAX_LABELS).map((label) => (
        <LabelChip key={label.id} label={label} />
      ))}
      {hidden.length > 0 && (
        <span
          title={hidden.map((label) => label.name).join(', ')}
          className="text-xs text-muted-foreground"
        >
          +{hidden.length}
        </span>
      )}
    </span>
  );
}

type TaskRowItemProps = {
  row: TaskRow;
  properties: readonly ViewProperty[]; // ce que la vue affiche
  projectName: string;
  now: Date;
};

// Une ligne de 36 px. Toute la ligne ouvre la tâche par le lien du titre (son ::after la recouvre) :
// les icônes interactives viendront en `relative z-10` par-dessus.
export function TaskRowItem({ row, properties, projectName, now }: TaskRowItemProps) {
  const shows = (property: ViewProperty) => properties.includes(property);
  const overdue = isOverdue(row, now);
  return (
    <li className="relative flex h-9 items-center gap-2.5 px-5 text-sm transition-colors hover:bg-accent/60 has-[a:focus-visible]:bg-accent/60">
      {shows('priority') && <PriorityIcon priority={row.priority} />}
      {shows('id') && (
        <span className="w-[4.5rem] shrink-0 font-mono text-xs text-muted-foreground">
          {row.ref}
        </span>
      )}
      {shows('status') && (
        <StatusIcon category={row.statusCategory} color={row.statusColor} label={row.statusLabel} />
      )}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {shows('parent') && row.parentRef && (
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            <span className="sr-only">Sous-tâche de </span>
            {row.parentRef}
            <span aria-hidden="true"> ›</span>
          </span>
        )}
        <Link
          href={`/taches/${row.ref}`}
          title={row.title}
          className="min-w-0 truncate after:absolute after:inset-0"
        >
          <TaskTitle title={row.title} />
        </Link>
      </div>
      {shows('labels') && row.labels.length > 0 && <Labels labels={row.labels} />}
      {shows('subtasks') && row.subtaskCount > 0 && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <ListTree size={12} strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">Sous-tâches terminées : </span>
          {row.subtaskDoneCount}/{row.subtaskCount}
        </span>
      )}
      {shows('project') && (
        <span className="hidden max-w-28 shrink-0 truncate text-xs text-muted-foreground @4xl:block">
          {projectName}
        </span>
      )}
      {shows('assignee') && <Avatar person={row.assignee} />}
      {shows('due_date') && (
        <span
          className={cn(
            'w-[5.5rem] shrink-0 text-right text-xs text-muted-foreground tabular-nums',
            overdue && 'text-destructive',
          )}
        >
          {row.dueDate && formatDue(row.dueDate, now)}
          {overdue && <span className="sr-only"> (en retard)</span>}
        </span>
      )}
      {shows('status_age') && (
        <DateCell label="Dans ce statut depuis">
          {formatRelative(row.statusChangedAt, now)}
        </DateCell>
      )}
      {shows('created') && <DateCell label="Créée le">{formatDate(row.createdAt)}</DateCell>}
      {shows('updated') && (
        <DateCell label="Mise à jour">{formatRelative(row.updatedAt, now)}</DateCell>
      )}
    </li>
  );
}
