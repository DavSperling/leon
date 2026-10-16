import type { ViewProperty } from '@/lib/enums';
import { formatDate, formatRelative } from '@/lib/format';
import type { TaskRow } from '@/server/tasks/task-row';

type RowDate = { property: ViewProperty; label: string; value: string };

// Les trois dates qu'une vue peut afficher, avec leur intitulé pour les lecteurs d'écran.
export function rowDates(row: TaskRow, now: Date): RowDate[] {
  return [
    {
      property: 'status_age',
      label: 'Dans ce statut depuis',
      value: formatRelative(row.statusChangedAt, now),
    },
    { property: 'created', label: 'Créée le', value: formatDate(row.createdAt) },
    { property: 'updated', label: 'Mise à jour', value: formatRelative(row.updatedAt, now) },
  ];
}
