'use client';

import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import type { ViewConfig } from '@/lib/tasks/view-config';
import type { TaskPrefill } from './create-draft';
import { CreateTaskDialog } from './create-task-dialog';
import type { ListContext } from './list-context';
import { isTypingOrBusy } from './typing';

type OpenCreate = (prefill?: TaskPrefill) => void;

const CreateTaskContext = createContext<OpenCreate | null>(null);

// Ouvre la création rapide, avec ce que le groupe ou la vue souffle.
export function useCreateTask(): OpenCreate {
  const open = useContext(CreateTaskContext);
  if (!open) throw new Error('useCreateTask s’emploie sous CreateTaskProvider.');
  return open;
}

type CreateTaskProviderProps = {
  config: ViewConfig;
  context: ListContext;
  now: Date;
  children: ReactNode;
};

// Un seul dialogue pour toute la page : le bouton « Nouvelle tâche », les « + » des groupes et la
// touche C (sauf quand on écrit quelque part ou qu'un menu ou un dialogue a la main) l'ouvrent.
export function CreateTaskProvider({ config, context, now, children }: CreateTaskProviderProps) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<TaskPrefill>({});
  const openCreate: OpenCreate = (next = {}) => {
    setPrefill(next);
    setOpen(true);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const plain = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
      if (event.key.toLowerCase() !== 'c' || !plain || event.repeat || isTypingOrBusy()) return;
      event.preventDefault();
      setPrefill({});
      setOpen(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <CreateTaskContext value={openCreate}>
      {children}
      <CreateTaskDialog
        open={open}
        onOpenChange={setOpen}
        prefill={prefill}
        filterProjectId={config.filters.projectId}
        context={context}
        now={now}
      />
    </CreateTaskContext>
  );
}
