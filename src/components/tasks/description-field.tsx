'use client';

import { Check } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { updateTaskAction } from '@/app/(taches)/taches/actions';
import { Textarea } from '@/components/ui/textarea';
import { DESCRIPTION_MAX_CHARS } from '@/lib/tasks/limits';
import { safely } from './safely';

const SAVE_DELAY_MS = 800;

type SaveState = 'idle' | 'saving' | 'saved';

type DescriptionFieldProps = { taskId: string; value: string };

// La description (Markdown), enregistrée seule : après une pause de frappe de 800 ms, à la sortie
// du champ et quand on quitte la page. `value` n'est que le point de départ : il n'y a pas de
// co-édition, et un texte venu du serveur ne doit jamais écraser ce qu'on tape (la page remonte ce
// composant, par sa clé, quand on change de tâche).
export function DescriptionField({ taskId, value }: DescriptionFieldProps) {
  const id = useId();
  const [text, setText] = useState(value);
  const [state, setState] = useState<SaveState>('idle');
  const latest = useRef(value); // le texte affiché, lu par l'enregistrement
  const saved = useRef(value); // le dernier texte que le serveur a reçu
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const save = useCallback(async () => {
    const next = latest.current;
    const before = saved.current;
    if (next === before) return;
    saved.current = next;
    setState('saving');
    const result = await safely(updateTaskAction(taskId, { descriptionMd: next }));
    if (result.ok) return setState('saved');
    saved.current = before;
    setState('idle');
    toast.error(result.error);
  }, [taskId]);

  const saveNow = useCallback(() => {
    clearTimeout(timer.current);
    void save();
  }, [save]);
  useEffect(() => saveNow, [saveNow]); // enregistre aussi au démontage

  return (
    <section aria-labelledby={id} className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h2 id={id} className="sr-only">
          Description
        </h2>
        <span
          aria-live="polite"
          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground"
        >
          {state === 'saving' && 'Enregistrement…'}
          {state === 'saved' && (
            <>
              <Check size={12} strokeWidth={1.5} aria-hidden="true" />
              Enregistré
            </>
          )}
        </span>
      </div>
      <Textarea
        value={text}
        maxLength={DESCRIPTION_MAX_CHARS}
        rows={4}
        aria-labelledby={id}
        placeholder="Ajouter une description (Markdown)…"
        onChange={(event) => {
          latest.current = event.target.value;
          setText(event.target.value);
          setState('idle');
          clearTimeout(timer.current);
          timer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
        }}
        onBlur={saveNow}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          // preventDefault : la page ne doit pas aussi revenir à la liste.
          event.preventDefault();
          event.currentTarget.blur();
        }}
        className="-mx-2.5 min-h-28 resize-none border-transparent bg-transparent text-[15px] leading-6 shadow-none hover:border-border dark:bg-transparent"
      />
    </section>
  );
}
