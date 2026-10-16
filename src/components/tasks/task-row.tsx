'use client';

import { ListTree } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import type { ViewProperty } from '@/lib/enums';
import { cn } from '@/lib/utils';
import type { TaskRow } from '@/server/tasks/task-row';
import type { ListContext } from './list-context';
import { AssigneeCell, DueCell, LabelsCell, PriorityCell, StatusCell } from './row-cells';
import { rowDates } from './row-dates';
import { useSelection } from './selection-provider';
import { TaskTitle } from './task-title';
import { useTaskEdit } from './use-task-edit';
import { useTaskHref } from './use-task-href';

// Une date d'information, avec son intitulé pour les lecteurs d'écran.
function DateCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground @3xl:block">
      <span className="sr-only">{label} </span>
      {children}
    </span>
  );
}

type TaskRowItemProps = {
  row: TaskRow;
  properties: readonly ViewProperty[]; // ce que la vue affiche
  projectName: string;
  context: ListContext;
  now: Date;
};

// Une ligne de 36 px. Toute la ligne ouvre la tâche par le lien du titre (son ::after la recouvre) ;
// les cellules modifiables passent par-dessus (row-cells). Un changement s'affiche tout de suite,
// puis la liste se rafraîchit : la ligne change de groupe si son statut ou son assigné a changé.
// La case de sélection se montre au survol, au focus, et sur toutes les lignes dès qu'une est cochée.
export function TaskRowItem({
  row: current,
  properties,
  projectName,
  context,
  now,
}: TaskRowItemProps) {
  const { row, edit } = useTaskEdit(current);
  const href = useTaskHref();
  const { selectedRows, isSelected, select } = useSelection();
  const selected = isSelected(row.id);
  const shows = (property: ViewProperty) => properties.includes(property);
  return (
    <li
      data-task-id={row.id}
      onMouseDown={(event) => {
        // Maj+clic ne doit pas non plus sélectionner le texte entre deux lignes.
        if (event.shiftKey) event.preventDefault();
      }}
      className={cn(
        'group/item relative flex h-9 items-center gap-1.5 pr-5 pl-8 text-sm transition-colors hover:bg-accent/60 has-[a:focus-visible]:bg-accent has-[a:focus-visible]:shadow-[inset_2px_0_0_var(--ring)]',
        selected && 'bg-primary-soft hover:bg-primary-soft',
      )}
    >
      <Checkbox
        checked={selected}
        aria-label={`Sélectionner ${row.ref}`}
        onClick={(event) => select(row.id, event.shiftKey)}
        className={cn(
          'absolute top-2.5 left-1.5 z-10',
          selectedRows.length === 0 &&
            'opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100',
        )}
      />
      {shows('priority') && <PriorityCell row={row} edit={edit} />}
      {shows('id') && (
        <span className="w-[4.5rem] shrink-0 pl-1 font-mono text-xs text-muted-foreground">
          {row.ref}
        </span>
      )}
      {shows('status') && <StatusCell row={row} statuses={context.statuses} edit={edit} />}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-1">
        {shows('parent') && row.parentRef && (
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            <span className="sr-only">Sous-tâche de </span>
            {row.parentRef}
            <span aria-hidden="true"> ›</span>
          </span>
        )}
        <Link
          href={href(row.ref)}
          title={row.title}
          onClick={(event) => {
            // Maj+clic étend la sélection au lieu d'ouvrir la tâche.
            if (!event.shiftKey) return;
            event.preventDefault();
            select(row.id, true);
          }}
          className="min-w-0 scroll-mt-40 scroll-mb-20 truncate after:absolute after:inset-0"
        >
          <TaskTitle title={row.title} />
        </Link>
      </div>
      {shows('labels') && <LabelsCell row={row} labels={context.labels} edit={edit} />}
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
      {shows('assignee') && <AssigneeCell row={row} context={context} edit={edit} />}
      {shows('due_date') && <DueCell row={row} now={now} edit={edit} />}
      {rowDates(row, now)
        .filter(({ property }) => shows(property))
        .map(({ property, label, value }) => (
          <DateCell key={property} label={label}>
            {value}
          </DateCell>
        ))}
    </li>
  );
}
