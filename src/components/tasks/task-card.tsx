'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ListTree } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ViewProperty } from '@/lib/enums';
import { cn } from '@/lib/utils';
import type { TaskRow } from '@/server/tasks/task-row';
import type { ListContext } from './list-context';
import { AssigneeCell, DueCell, LabelsCell, PriorityCell, StatusCell } from './row-cells';
import { rowDates } from './row-dates';
import { TaskTitle } from './task-title';
import { type TaskEdit, useTaskEdit } from './use-task-edit';

export type CardProps = {
  row: TaskRow;
  properties: readonly ViewProperty[]; // ce que la vue affiche
  projectName: string;
  context: ListContext;
  now: Date;
};

const CARD = 'relative flex flex-col gap-1 rounded-lg border bg-card p-2.5 text-sm';

type PartProps = {
  row: TaskRow;
  edit: TaskEdit;
  shows: (property: ViewProperty) => boolean; // la vue affiche cette propriété
  context: ListContext;
};

// Identifiant (avec son parent en fil d'Ariane), projet, poignée et assigné.
function CardHead({
  row,
  edit,
  shows,
  context,
  projectName,
  handle,
}: PartProps & { projectName: string; handle?: ReactNode }) {
  if (!shows('id') && !shows('project') && !shows('assignee') && !handle) return null;
  return (
    <div className="flex min-h-6 items-center gap-1">
      <span className="flex min-w-0 items-baseline gap-1.5 text-xs text-muted-foreground">
        {shows('id') && (
          <span className="shrink-0 font-mono">
            {shows('parent') && row.parentRef && (
              <>
                <span className="sr-only">Sous-tâche de </span>
                {row.parentRef}
                <span aria-hidden="true"> › </span>
              </>
            )}
            {row.ref}
          </span>
        )}
        {shows('project') && <span className="truncate">{projectName}</span>}
      </span>
      <span className="ml-auto flex items-center gap-1">
        {handle}
        {shows('assignee') && <AssigneeCell row={row} context={context} edit={edit} />}
      </span>
    </div>
  );
}

// Priorité, étiquettes, sous-tâches et échéance.
function CardMeta({ row, edit, shows, context, now }: PartProps & { now: Date }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shows('priority') && <PriorityCell row={row} edit={edit} />}
      {shows('labels') && (
        <LabelsCell row={row} labels={context.labels} edit={edit} className="flex" />
      )}
      {shows('subtasks') && row.subtaskCount > 0 && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <ListTree size={12} strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">Sous-tâches terminées : </span>
          {row.subtaskDoneCount}/{row.subtaskCount}
        </span>
      )}
      {shows('due_date') && <DueCell row={row} now={now} edit={edit} className="ml-auto w-auto" />}
    </div>
  );
}

// Le contenu d'une carte. Toute la carte ouvre la tâche par le lien du titre (son ::after la
// recouvre) ; les cellules modifiables passent par-dessus (row-cells), comme sur une ligne de la liste.
function CardContent({
  row: current,
  properties,
  projectName,
  context,
  now,
  handle,
}: CardProps & { handle?: ReactNode }) {
  const { row, edit } = useTaskEdit(current);
  const shows = (property: ViewProperty) => properties.includes(property);
  const part = { row, edit, shows, context };
  const dates = rowDates(row, now).filter(({ property }) => shows(property));
  return (
    <>
      <CardHead {...part} projectName={projectName} handle={handle} />
      <div className="flex items-start gap-1">
        {shows('status') && <StatusCell row={row} statuses={context.statuses} edit={edit} />}
        <Link
          href={`/taches/${row.ref}`}
          title={row.title}
          className="line-clamp-2 min-w-0 flex-1 py-0.5 leading-5 break-words after:absolute after:inset-0"
        >
          <TaskTitle title={row.title} />
        </Link>
      </div>
      <CardMeta {...part} now={now} />
      {dates.length > 0 && (
        <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {dates.map(({ property, label, value }) => (
            <span key={property}>
              <span className="sr-only">{label} </span>
              {value}
            </span>
          ))}
        </p>
      )}
    </>
  );
}

type TaskCardProps = CardProps & {
  draggable: boolean;
  droppable: boolean; // la colonne de la carte accepte la tâche qu'on glisse
};

// Une carte de colonne. La souris la glisse de partout ; le clavier la prend par sa poignée, seul
// élément qui active le glissement au clavier (la touche Entrée d'une cellule ne le déclenche pas).
export function TaskCard({ draggable, droppable, ...card }: TaskCardProps) {
  const sortable = useSortable({
    id: card.row.id,
    disabled: { draggable: !draggable, droppable: !droppable },
  });
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } =
    sortable;
  const handle = draggable && (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      aria-roledescription="carte déplaçable"
      aria-label={`Déplacer ${card.row.ref}`}
      className="relative z-10 flex size-6 cursor-grab items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-colors group-hover/item:opacity-100 hover:bg-accent focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <GripVertical size={14} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        CARD,
        'group/item shadow-xs hover:shadow-sm has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50',
        sortable.isDragging && 'opacity-40',
      )}
    >
      <CardContent {...card} handle={handle} />
    </li>
  );
}

// La carte que le pointeur emporte : une copie sans interaction, au-dessus du reste.
export function CardPreview(card: CardProps) {
  return (
    <div inert className={cn(CARD, 'group/item cursor-grabbing shadow-lg ring-1 ring-ring/40')}>
      <CardContent {...card} />
    </div>
  );
}
