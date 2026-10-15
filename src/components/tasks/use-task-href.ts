'use client';

import { useSearchParams } from 'next/navigation';
import { taskHref } from '@/lib/tasks/task-links';

// L'adresse d'une tâche depuis la liste affichée : la page de la tâche la relit pour ramener à la
// même liste (Échap, fil d'Ariane).
export function useTaskHref(): (ref: string) => string {
  const query = useSearchParams().toString();
  return (ref) => taskHref(ref, query);
}
