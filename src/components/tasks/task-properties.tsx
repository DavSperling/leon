import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatDue, isOverdue } from '@/lib/tasks/dates';
import { PRIORITY_LABELS } from '@/lib/tasks/labels';
import { cn } from '@/lib/utils';
import type { TaskDetail } from '@/server/tasks/tasks';
import { Avatar } from './avatar';
import { LabelChip } from './label-chip';
import { PriorityIcon } from './priority-icon';
import { StatusIcon } from './status-icon';
import { TaskTitle } from './task-title';

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <dt className="w-28 shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">{children}</dd>
    </div>
  );
}

const Empty = ({ text }: { text: string }) => <span className="text-muted-foreground">{text}</span>;

// Les propriétés d'une tâche, en lecture : les sélecteurs viendront les rendre modifiables.
export function TaskProperties({ task, now }: { task: TaskDetail; now: Date }) {
  const overdue = isOverdue(task, now);
  return (
    <dl className="space-y-0.5">
      <Property label="Statut">
        <StatusIcon category={task.statusCategory} color={task.statusColor} />
        {task.statusLabel}
      </Property>
      <Property label="Priorité">
        <PriorityIcon priority={task.priority} />
        {PRIORITY_LABELS[task.priority]}
      </Property>
      <Property label="Assigné">
        <Avatar person={task.assignee} />
        {task.assignee?.name ?? <Empty text="Personne" />}
      </Property>
      <Property label="Étiquettes">
        {task.labels.length > 0 ? (
          task.labels.map((label) => <LabelChip key={label.id} label={label} />)
        ) : (
          <Empty text="Aucune" />
        )}
      </Property>
      <Property label="Projet">
        <span className="font-mono text-xs">{task.projectKey}</span>
      </Property>
      <Property label="Échéance">
        {task.dueDate ? (
          <span className={cn(overdue && 'text-destructive')}>
            {formatDue(task.dueDate, now)}
            {overdue && <span className="sr-only"> (en retard)</span>}
          </span>
        ) : (
          <Empty text="Aucune" />
        )}
      </Property>
      <Property label="Parent">
        {task.parent ? (
          <Link href={`/taches/${task.parent.ref}`} className="min-w-0 truncate hover:underline">
            <span className="font-mono text-xs text-muted-foreground">{task.parent.ref}</span>{' '}
            <TaskTitle title={task.parent.title} />
          </Link>
        ) : (
          <Empty text="Aucun" />
        )}
      </Property>
    </dl>
  );
}
