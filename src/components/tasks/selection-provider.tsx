'use client';

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import type { TaskRow } from '@/server/tasks/task-row';
import { aimedRow } from './row-targets';
import { EMPTY_SELECTION, selectRow, visibleSelection } from './selection';
import { isTypingOrBusy } from './typing';
import { useTaskShortcuts } from './use-task-shortcuts';

type SelectionApi = {
  selectedRows: TaskRow[]; // dans l'ordre d'affichage
  isSelected: (id: string) => boolean;
  select: (id: string, range: boolean) => void; // coche ou décoche ; `range` : jusqu'à la dernière touchée
  clear: () => void;
};

const SelectionContext = createContext<SelectionApi | null>(null);

export function useSelection(): SelectionApi {
  const api = useContext(SelectionContext);
  if (!api) throw new Error('useSelection s’emploie sous SelectionProvider.');
  return api;
}

type SelectionProviderProps = {
  rows: readonly TaskRow[]; // les tâches affichées, une fois chacune, dans l'ordre d'affichage
  children: ReactNode;
};

// La sélection multiple de la liste, avec ses touches : X coche la tâche visée (celle qui a le
// focus ou que le pointeur survole), Échap vide la sélection (sauf quand on écrit quelque part ou
// qu'un menu ou un dialogue a la main).
export function SelectionProvider({ rows, children }: SelectionProviderProps) {
  const [selection, setSelection] = useState(EMPTY_SELECTION);
  const order = useMemo(() => rows.map((row) => row.id), [rows]);

  useTaskShortcuts({
    select: () => {
      const id = aimedRow()?.dataset.taskId;
      if (!id) return false; // aucune tâche visée : X garde son effet normal
      setSelection((current) => selectRow(current, order, id, false));
    },
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const plain = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
      if (event.key === 'Escape' && plain && !event.repeat && !isTypingOrBusy()) {
        setSelection(EMPTY_SELECTION);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const api = useMemo<SelectionApi>(() => {
    const ids = visibleSelection(selection, order);
    return {
      selectedRows: rows.filter((row) => ids.has(row.id)),
      isSelected: (id) => ids.has(id),
      select: (id, range) => setSelection((current) => selectRow(current, order, id, range)),
      clear: () => setSelection(EMPTY_SELECTION),
    };
  }, [selection, order, rows]);

  return <SelectionContext value={api}>{children}</SelectionContext>;
}
