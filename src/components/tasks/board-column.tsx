'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

type BoardColumnProps = {
  columnKey: string;
  label: string;
  icon: ReactNode;
  ids: string[]; // les tâches de la colonne, dans l'ordre affiché
  accepting: boolean; // la tâche qu'on glisse peut y être déposée
  onCreate: () => void; // « + » : crée une tâche dans cette colonne
  children: ReactNode; // les cartes, dans l'ordre de `ids`
};

// Une colonne du tableau : son titre et le « + » en tête, puis ses cartes dans une liste qui défile.
// Toute la liste reçoit le dépôt, même vide.
export function BoardColumn({
  columnKey,
  label,
  icon,
  ids,
  accepting,
  onCreate,
  children,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey, disabled: !accepting });
  return (
    <section
      aria-label={label}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl bg-muted transition-colors',
        isOver && 'bg-accent',
      )}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 pr-1.5 pl-3">
        {icon}
        <h2 className="text-sm font-medium">{label}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatNumber(ids.length)}
          <span className="sr-only"> {ids.length > 1 ? 'tâches' : 'tâche'}</span>
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Nouvelle tâche dans ${label}`}
          onClick={onCreate}
          className="ml-auto"
        >
          <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
        </Button>
      </header>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          className="flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2"
        >
          {ids.length === 0 && (
            <li className="px-1 py-2 text-xs text-muted-foreground">Aucune tâche</li>
          )}
          {children}
        </ul>
      </SortableContext>
    </section>
  );
}
