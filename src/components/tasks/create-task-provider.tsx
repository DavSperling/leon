'use client';

import { createContext, type ReactNode, useContext, useState } from 'react';
import type { TaskPrefill } from './create-draft';
import { CreateTaskDialog } from './create-task-dialog';
import type { ListContext } from './list-context';
import { useTaskShortcuts } from './use-task-shortcuts';

type OpenCreate = (prefill?: TaskPrefill) => void;

const CreateTaskContext = createContext<OpenCreate | null>(null);

// Ouvre la création rapide, avec ce que le groupe ou la vue souffle.
export function useCreateTask(): OpenCreate {
  const open = useContext(CreateTaskContext);
  if (!open) throw new Error('useCreateTask s’emploie sous CreateTaskProvider.');
  return open;
}

type CreateTaskProviderProps = {
  projectId: string | null; // le projet de la liste filtrée ou de la tâche ouverte : celui des nouvelles tâches
  context: ListContext;
  now: Date;
  children: ReactNode;
};

// Un seul dialogue pour toute la page : le bouton « Nouvelle tâche », les « + » des groupes, la
// touche C et la palette l'ouvrent.
export function CreateTaskProvider({ projectId, context, now, children }: CreateTaskProviderProps) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<TaskPrefill>({});
  const openCreate: OpenCreate = (next = {}) => {
    setPrefill(next);
    setOpen(true);
  };

  useTaskShortcuts({ create: () => openCreate() });

  return (
    <CreateTaskContext value={openCreate}>
      {children}
      <CreateTaskDialog
        open={open}
        onOpenChange={setOpen}
        prefill={prefill}
        filterProjectId={projectId}
        context={context}
        now={now}
      />
    </CreateTaskContext>
  );
}
