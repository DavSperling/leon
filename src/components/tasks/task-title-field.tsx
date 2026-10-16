'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { TITLE_MAX_CHARS } from '@/lib/tasks/limits';
import { useTaskEdit } from './use-task-edit';

const oneLine = (text: string): string => text.replace(/\s*[\r\n]+\s*/g, ' ');

// Le titre de la page, modifiable sur place : Entrée ou la sortie du champ l'enregistre, Échap
// rend le titre d'avant. Un titre vide n'est pas enregistré.
export function TaskTitleField({ task }: { task: { id: string; title: string } }) {
  const { row, edit } = useTaskEdit(task);
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  const commit = () => {
    const title = (draft ?? row.title).trim();
    setDraft(null);
    if (title === '') return void toast.error('Le titre ne peut pas être vide.');
    if (title !== row.title) edit({ title }, { title });
  };

  return (
    <h1>
      <Textarea
        value={draft ?? row.title}
        rows={1}
        maxLength={TITLE_MAX_CHARS}
        aria-label="Titre"
        onChange={(event) => setDraft(oneLine(event.target.value))}
        onBlur={() => {
          if (!cancelled.current) return commit();
          cancelled.current = false;
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== 'Escape') return;
          // preventDefault : la page ne doit pas aussi revenir à la liste (Échap).
          event.preventDefault();
          cancelled.current = event.key === 'Escape';
          event.currentTarget.blur();
        }}
        className="-mx-2.5 min-h-0 resize-none border-transparent bg-transparent px-2.5 py-1 text-2xl leading-8 font-semibold tracking-tight shadow-none hover:border-border md:text-2xl dark:bg-transparent"
      />
    </h1>
  );
}
