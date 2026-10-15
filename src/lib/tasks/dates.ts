// Les échéances sont des jours civils (colonne `date`, « AAAA-MM-JJ ») : « aujourd'hui » se calcule
// à Paris, jamais avec `current_date` de la base ni avec le fuseau du serveur.
import type { DueFilter, TaskStatusCategory } from '@/lib/enums';
import { LOCALE, TIME_ZONE } from '@/lib/format';

const DAY_MS = 24 * 60 * 60 * 1000;

const parisDayFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
// Le jour est formaté en UTC : c'est une date civile, pas un instant.
const dueFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const toUtcMs = (day: string): number => Date.parse(`${day}T00:00:00Z`);
const fromUtcMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const addDays = (day: string, days: number): string => fromUtcMs(toUtcMs(day) + days * DAY_MS);

// « 2026-10-15 » : le jour qu'il est à Paris à l'instant `now`.
export function todayInParis(now: Date): string {
  const parts = Object.fromEntries(parisDayFormat.formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Bornes incluses d'un filtre d'échéance ; `from` nul = sans borne basse. « Sans échéance » n'a pas de bornes.
export type DueRange = { from: string | null; to: string };

// « Cette semaine » va du lundi au dimanche du jour courant.
export function dueFilterRange(filter: Exclude<DueFilter, 'none'>, now: Date): DueRange {
  const today = todayInParis(now);
  if (filter === 'overdue') return { from: null, to: addDays(today, -1) };
  const sinceMonday = (new Date(toUtcMs(today)).getUTCDay() + 6) % 7;
  const monday = addDays(today, -sinceMonday);
  return { from: monday, to: addDays(monday, 6) };
}

// « Aujourd'hui », « Demain », « ven. 17 oct. »
export function formatDue(date: string, now: Date): string {
  const today = todayInParis(now);
  if (date === today) return "Aujourd'hui";
  if (date === addDays(today, 1)) return 'Demain';
  return dueFormat.format(toUtcMs(date));
}

// En retard dès le lendemain de l'échéance ; une tâche terminée ou annulée ne l'est jamais.
export function isOverdue(
  task: { dueDate: string | null; statusCategory: TaskStatusCategory },
  now: Date,
): boolean {
  const closed = task.statusCategory === 'done' || task.statusCategory === 'canceled';
  return task.dueDate !== null && !closed && task.dueDate < todayInParis(now);
}
