'use client';

import { CalendarDays, Folder, ListTree, Tag } from 'lucide-react';
import type { ComponentProps, Dispatch, ReactNode, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { formatDue } from '@/lib/tasks/dates';
import { PRIORITY_LABELS } from '@/lib/tasks/labels';
import { Avatar } from './avatar';
import { type TaskDraft, withParent, withProject } from './create-draft';
import type { ListContext } from './list-context';
import { AssigneePicker } from './pickers/assignee-picker';
import { DueDatePicker } from './pickers/due-date-picker';
import { LabelsPicker } from './pickers/labels-picker';
import { ParentPicker } from './pickers/parent-picker';
import { PriorityPicker } from './pickers/priority-picker';
import { ProjectPicker } from './pickers/project-picker';
import { StatusPicker } from './pickers/status-picker';
import { PriorityIcon } from './priority-icon';
import { StatusIcon } from './status-icon';

type PillProps = Omit<ComponentProps<typeof Button>, 'children'> & {
  name: string; // la propriété : « Statut »
  current: string | null; // sa valeur ; sans valeur, la pastille porte le nom de la propriété
  icon: ReactNode;
};

// Le nom accessible dit la propriété et sa valeur ; le texte visible n'a que la valeur.
function Pill({ name, current, icon, ...props }: PillProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      aria-label={current ? `${name} : ${current}` : name}
      className="font-normal text-foreground-2"
      {...props}
    >
      {icon}
      <span className="max-w-36 truncate">{current ?? name}</span>
    </Button>
  );
}

const glyph = (Icon: typeof Folder) => <Icon size={14} strokeWidth={1.5} aria-hidden="true" />;

type DraftPillsProps = {
  draft: TaskDraft;
  setDraft: Dispatch<SetStateAction<TaskDraft>>;
  context: ListContext;
  now: Date;
};

// Les propriétés de la tâche en création : une pastille par propriété, chacune ouvre son sélecteur.
export function DraftPills({ draft, setDraft, context, now }: DraftPillsProps) {
  const patch = (change: Partial<TaskDraft>) => setDraft((current) => ({ ...current, ...change }));
  const statuses = context.statuses.filter((status) => status.projectId === draft.projectId);
  const status = statuses.find((candidate) => candidate.id === draft.statusId);
  const assignee = context.members.find((member) => member.id === draft.assigneeId) ?? null;
  const project = context.projects.find((candidate) => candidate.id === draft.projectId);
  const labelNames = draft.labels.map((label) => label.name).join(', ');
  return (
    <div className="flex flex-wrap gap-1.5">
      <ProjectPicker
        projects={context.projects}
        value={draft.projectId}
        onChange={(id) => setDraft((current) => withProject(current, id, context.statuses))}
      >
        <Pill name="Projet" current={project?.name ?? null} icon={glyph(Folder)} />
      </ProjectPicker>
      <StatusPicker
        statuses={statuses}
        value={draft.statusId}
        onChange={(statusId) => patch({ statusId })}
      >
        <Pill
          name="Statut"
          current={status?.label ?? null}
          icon={status && <StatusIcon category={status.category} color={status.color} />}
        />
      </StatusPicker>
      <PriorityPicker value={draft.priority} onChange={(priority) => patch({ priority })}>
        <Pill
          name="Priorité"
          current={draft.priority ? PRIORITY_LABELS[draft.priority] : null}
          icon={<PriorityIcon priority={draft.priority ?? 'none'} />}
        />
      </PriorityPicker>
      <AssigneePicker
        members={context.members}
        viewerId={context.viewerId}
        value={draft.assigneeId}
        onChange={(assigneeId) => patch({ assigneeId })}
      >
        <Pill name="Assigné" current={assignee?.name ?? null} icon={<Avatar person={assignee} />} />
      </AssigneePicker>
      <LabelsPicker
        labels={context.labels}
        value={draft.labels.map((label) => label.id)}
        onToggle={(label, selected) =>
          setDraft((current) => ({
            ...current,
            labels: selected
              ? [...current.labels, label]
              : current.labels.filter((candidate) => candidate.id !== label.id),
          }))
        }
      >
        <Pill name="Étiquettes" current={labelNames || null} icon={glyph(Tag)} />
      </LabelsPicker>
      <DueDatePicker value={draft.dueDate} now={now} onChange={(dueDate) => patch({ dueDate })}>
        <Pill
          name="Échéance"
          current={draft.dueDate ? formatDue(draft.dueDate, now) : null}
          icon={glyph(CalendarDays)}
        />
      </DueDatePicker>
      <ParentPicker
        value={draft.parent}
        onChange={(parent) => setDraft((current) => withParent(current, parent, context.statuses))}
      >
        <Pill name="Parent" current={draft.parent?.ref ?? null} icon={glyph(ListTree)} />
      </ParentPicker>
    </div>
  );
}
