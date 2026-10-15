'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useId, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createTaskAction } from '@/app/(taches)/taches/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TITLE_MAX_CHARS } from '@/lib/tasks/limits';
import { taskHref } from '@/lib/tasks/task-links';
import type { TaskRow } from '@/server/tasks/task-row';
import type { ListContext } from './list-context';
import { AssigneeCell, StatusCell } from './row-cells';
import { safely } from './safely';
import { TaskTitle } from './task-title';
import { useTaskEdit } from './use-task-edit';

type SubtaskRowProps = { row: TaskRow; context: ListContext; listQuery: string };

// Une ligne compacte. Toute la ligne ouvre la sous-tâche par le lien du titre (son ::after la
// recouvre) ; le statut et l'assigné se changent sur place, comme dans la liste.
function SubtaskRow({ row: current, context, listQuery }: SubtaskRowProps) {
  const { row, edit } = useTaskEdit(current);
  return (
    <li className="group/item relative flex h-8 items-center gap-1.5 rounded-md pr-1.5 pl-1 text-sm transition-colors hover:bg-accent/60 has-[a:focus-visible]:bg-accent/60">
      <StatusCell row={row} statuses={context.statuses} edit={edit} />
      <span className="w-[4.5rem] shrink-0 font-mono text-xs text-muted-foreground">{row.ref}</span>
      <Link
        href={taskHref(row.ref, listQuery)}
        title={row.title}
        className="min-w-0 flex-1 truncate after:absolute after:inset-0"
      >
        <TaskTitle title={row.title} />
      </Link>
      <AssigneeCell row={row} context={context} edit={edit} />
    </li>
  );
}

type AddSubtaskProps = { parentId: string; onClose: () => void };

// Entrée crée la sous-tâche (elle hérite du projet et de la priorité de son parent) et garde le champ
// pour la suivante ; Échap, ou la sortie d'un champ vide, le ferme.
function AddSubtask({ parentId, onClose }: AddSubtaskProps) {
  const id = useId();
  const [title, setTitle] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending || title.trim() === '') return;
    startTransition(async () => {
      const result = await safely(createTaskAction({ title, parentId }));
      if (result.ok) setTitle('');
      else toast.error(result.error);
    });
  };

  return (
    <form onSubmit={submit} className="px-1 pt-1">
      <label htmlFor={id} className="sr-only">
        Titre de la sous-tâche
      </label>
      <Input
        id={id}
        autoFocus
        value={title}
        maxLength={TITLE_MAX_CHARS}
        placeholder="Titre de la sous-tâche, puis Entrée"
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => title.trim() === '' && onClose()}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          // preventDefault : la page ne doit pas aussi revenir à la liste.
          event.preventDefault();
          onClose();
        }}
        className="h-8 text-sm"
      />
    </form>
  );
}

type SubtaskListProps = {
  parentId: string;
  subtasks: TaskRow[];
  doneCount: number;
  context: ListContext;
  listQuery: string;
};

// Les sous-tâches de la tâche : une liste compacte, puis « Ajouter une sous-tâche ».
export function SubtaskList({
  parentId,
  subtasks,
  doneCount,
  context,
  listQuery,
}: SubtaskListProps) {
  const headingId = useId();
  const [adding, setAdding] = useState(false);
  return (
    <section aria-labelledby={headingId} className="space-y-1">
      <h2 id={headingId} className="flex items-baseline gap-2 text-sm font-medium">
        Sous-tâches
        {subtasks.length > 0 && (
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            <span className="sr-only">terminées : </span>
            {doneCount}/{subtasks.length}
          </span>
        )}
      </h2>
      {subtasks.length > 0 && (
        <ul className="-mx-1">
          {subtasks.map((row) => (
            <SubtaskRow key={row.id} row={row} context={context} listQuery={listQuery} />
          ))}
        </ul>
      )}
      {adding ? (
        <div className="-mx-1">
          <AddSubtask parentId={parentId} onClose={() => setAdding(false)} />
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground"
          onClick={() => setAdding(true)}
        >
          <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
          Ajouter une sous-tâche
        </Button>
      )}
    </section>
  );
}
