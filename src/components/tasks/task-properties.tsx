'use client';

import { CalendarDays, Folder, ListTree, Tag } from 'lucide-react';
import { type ComponentProps, type ReactNode, useTransition } from 'react';
import { toast } from 'sonner';
import { changeProjectAction } from '@/app/(taches)/taches/[ref]/actions';
import { formatDue, isOverdue } from '@/lib/tasks/dates';
import { PRIORITY_LABELS } from '@/lib/tasks/labels';
import { cn } from '@/lib/utils';
import type { TaskRow } from '@/server/tasks/task-row';
import type { TaskDetail } from '@/server/tasks/tasks';
import { Avatar } from './avatar';
import { LabelChip } from './label-chip';
import { type ListContext, shownStatus } from './list-context';
import { AssigneePicker } from './pickers/assignee-picker';
import { DueDatePicker } from './pickers/due-date-picker';
import { LabelsPicker } from './pickers/labels-picker';
import { ParentPicker } from './pickers/parent-picker';
import { PriorityPicker } from './pickers/priority-picker';
import { ProjectPicker } from './pickers/project-picker';
import { StatusPicker } from './pickers/status-picker';
import { PriorityIcon } from './priority-icon';
import { safely } from './safely';
import { StatusIcon } from './status-icon';
import { TaskTitle } from './task-title';
import { type TaskEdit, useTaskEdit } from './use-task-edit';

// Ce que la colonne des propriétés montre d'une tâche : sa ligne de la liste, et son parent.
export type PropertiesTask = TaskRow & { parent: TaskDetail['parent'] };

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-start gap-2">
      <dt className="w-[4.5rem] shrink-0 pt-1 text-xs leading-6 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

// Le déclencheur d'un sélecteur : toute la valeur est cliquable, sur au moins 28 px de haut.
function PropertyButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'flex min-h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 py-0.5 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-accent',
        className,
      )}
      {...props}
    />
  );
}

const Empty = ({ text }: { text: string }) => <span className="text-muted-foreground">{text}</span>;
const glyph = (Icon: typeof Folder) => (
  <Icon size={14} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-muted-foreground" />
);

type PartProps = { task: PropertiesTask; context: ListContext; edit: TaskEdit<PropertiesTask> };

function StatusProperty({ task, context, edit }: PartProps) {
  const change = (statusId: string) => {
    const status = context.statuses.find((candidate) => candidate.id === statusId);
    if (status) edit({ statusId }, shownStatus(status));
  };
  return (
    <Property label="Statut">
      <StatusPicker statuses={context.statuses} value={task.statusId} onChange={change}>
        <PropertyButton aria-label={`Statut : ${task.statusLabel}`}>
          <StatusIcon category={task.statusCategory} color={task.statusColor} />
          <span className="truncate">{task.statusLabel}</span>
        </PropertyButton>
      </StatusPicker>
    </Property>
  );
}

function PriorityProperty({ task, edit }: PartProps) {
  return (
    <Property label="Priorité">
      <PriorityPicker
        value={task.priority}
        onChange={(priority) => edit({ priority }, { priority })}
      >
        <PropertyButton aria-label={`Priorité : ${PRIORITY_LABELS[task.priority]}`}>
          <PriorityIcon priority={task.priority} />
          {PRIORITY_LABELS[task.priority]}
        </PropertyButton>
      </PriorityPicker>
    </Property>
  );
}

function AssigneeProperty({ task, context, edit }: PartProps) {
  const change = (assigneeId: string | null) =>
    edit({ assigneeId }, { assignee: context.members.find((m) => m.id === assigneeId) ?? null });
  return (
    <Property label="Assigné">
      <AssigneePicker
        members={context.members}
        viewerId={context.viewerId}
        value={task.assignee?.id ?? null}
        onChange={change}
      >
        <PropertyButton aria-label={`Assigné : ${task.assignee?.name ?? 'personne'}`}>
          <Avatar person={task.assignee} />
          {task.assignee ? (
            <span className="truncate">{task.assignee.name}</span>
          ) : (
            <Empty text="Personne" />
          )}
        </PropertyButton>
      </AssigneePicker>
    </Property>
  );
}

function LabelsProperty({ task, context, edit }: PartProps) {
  const toggle = (label: ListContext['labels'][number], selected: boolean) =>
    edit(selected ? { addLabelIds: [label.id] } : { removeLabelIds: [label.id] }, {
      labels: selected
        ? [...task.labels, label]
        : task.labels.filter((candidate) => candidate.id !== label.id),
    });
  const names = task.labels.map((label) => label.name).join(', ') || 'aucune';
  return (
    <Property label="Étiquettes">
      <LabelsPicker
        labels={context.labels}
        value={task.labels.map((label) => label.id)}
        onToggle={toggle}
      >
        <PropertyButton aria-label={`Étiquettes : ${names}`} className="flex-wrap">
          {task.labels.length === 0 && (
            <>
              {glyph(Tag)}
              <Empty text="Aucune" />
            </>
          )}
          {task.labels.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
        </PropertyButton>
      </LabelsPicker>
    </Property>
  );
}

// Un autre projet donne un autre numéro, donc une autre adresse : l'action redirige vers elle.
function ProjectProperty({
  task,
  context,
  listQuery,
}: Omit<PartProps, 'edit'> & { listQuery: string }) {
  const [, startTransition] = useTransition();
  const name = context.projects.find((project) => project.id === task.projectId)?.name;
  const change = (projectId: string) =>
    startTransition(async () => {
      const result = await safely(changeProjectAction(task.id, projectId, listQuery));
      // Une redirection ne rend rien : seule une erreur revient.
      if (result?.error) toast.error(result.error);
    });
  return (
    <Property label="Projet">
      <ProjectPicker projects={context.projects} value={task.projectId} onChange={change}>
        <PropertyButton aria-label={`Projet : ${name ?? task.projectKey}`}>
          {glyph(Folder)}
          <span className="truncate">{name ?? task.projectKey}</span>
          <span className="ml-auto font-mono text-xs text-muted-foreground">{task.projectKey}</span>
        </PropertyButton>
      </ProjectPicker>
    </Property>
  );
}

function DueProperty({ task, edit, now }: Omit<PartProps, 'context'> & { now: Date }) {
  const overdue = isOverdue(task, now);
  const label = task.dueDate ? formatDue(task.dueDate, now) : 'aucune';
  return (
    <Property label="Échéance">
      <DueDatePicker
        value={task.dueDate}
        now={now}
        onChange={(dueDate) => edit({ dueDate }, { dueDate })}
      >
        <PropertyButton
          aria-label={`Échéance : ${label}${overdue ? ' (en retard)' : ''}`}
          className={cn(overdue && 'text-destructive')}
        >
          {glyph(CalendarDays)}
          {task.dueDate ? label : <Empty text="Aucune" />}
        </PropertyButton>
      </DueDatePicker>
    </Property>
  );
}

function ParentProperty({ task, edit }: Omit<PartProps, 'context'>) {
  const { parent } = task;
  return (
    <Property label="Parent">
      <ParentPicker
        value={parent}
        onChange={(next) =>
          edit({ parentId: next?.id ?? null }, { parent: next, parentRef: next?.ref ?? null })
        }
      >
        <PropertyButton aria-label={`Parent : ${parent?.ref ?? 'aucun'}`}>
          {glyph(ListTree)}
          {parent ? (
            <span className="truncate">
              <span className="font-mono text-xs text-muted-foreground">{parent.ref}</span>{' '}
              <TaskTitle title={parent.title} />
            </span>
          ) : (
            <Empty text="Aucun" />
          )}
        </PropertyButton>
      </ParentPicker>
    </Property>
  );
}

type TaskPropertiesProps = {
  task: PropertiesTask;
  context: ListContext;
  now: Date;
  listQuery: string; // la liste d'où l'on vient, gardée quand la tâche change d'adresse
};

// Les propriétés d'une tâche, chacune avec son sélecteur : le changement s'affiche tout de suite,
// puis la page se rafraîchit ; une erreur le défait et s'affiche.
export function TaskProperties({ task: current, context, now, listQuery }: TaskPropertiesProps) {
  const { row: task, edit } = useTaskEdit(current);
  const part = { task, context, edit };
  return (
    <dl className="space-y-0.5">
      <StatusProperty {...part} />
      <PriorityProperty {...part} />
      <AssigneeProperty {...part} />
      <LabelsProperty {...part} />
      <ProjectProperty {...part} listQuery={listQuery} />
      <DueProperty {...part} now={now} />
      <ParentProperty {...part} />
    </dl>
  );
}
