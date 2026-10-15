'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { TaskRow } from '@/server/tasks/task-row';
import { EMPTY_SELECTION, selectRow, visibleSelection } from './selection';
import { isTypingOrBusy } from './typing';

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

// Le dernier identifiant de ligne que le pointeur ou le clavier a atteint : la ligne que X vise.
const rowIdOf = (target: EventTarget | null): string | null =>
  target instanceof Element
    ? (target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId ?? null)
    : null;

type SelectionProviderProps = {
  rows: readonly TaskRow[]; // les tâches affichées, une fois chacune, dans l'ordre d'affichage
  children: ReactNode;
};

// La sélection multiple de la liste, avec ses touches : X coche la ligne visée, Échap vide la
// sélection (sauf quand on écrit quelque part ou qu'un menu ou un dialogue a la main).
export function SelectionProvider({ rows, children }: SelectionProviderProps) {
  const [selection, setSelection] = useState(EMPTY_SELECTION);
  const order = useMemo(() => rows.map((row) => row.id), [rows]);
  const aimed = useRef<string | null>(null);

  useEffect(() => {
    const aim = (event: Event) => {
      aimed.current = rowIdOf(event.target);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const plain = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
      if (!plain || event.repeat || isTypingOrBusy()) return;
      const id = aimed.current;
      if (event.key === 'Escape') setSelection(EMPTY_SELECTION);
      else if (event.key.toLowerCase() === 'x' && id !== null) {
        event.preventDefault();
        setSelection((current) => selectRow(current, order, id, false));
      }
    };
    document.addEventListener('pointerover', aim);
    document.addEventListener('focusin', aim);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerover', aim);
      document.removeEventListener('focusin', aim);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [order]);

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
