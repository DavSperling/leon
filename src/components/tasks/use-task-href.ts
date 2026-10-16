'use client';

import { useSearchParams } from 'next/navigation';
import { listQueryOf, taskHref } from '@/lib/tasks/task-links';

// L'adresse d'une tâche depuis la liste affichée, ou depuis une tâche (le dialogue de création y
// est monté) : la page de la tâche relit la liste d'origine pour y ramener (Échap, fil d'Ariane).
export function useTaskHref(): (ref: string) => string {
  const query = listQueryOf(useSearchParams());
  return (ref) => taskHref(ref, query);
}
