import type { FicheLine } from '@/server/portrait/fiche';
import type { Genre, ValeurDe } from '@/server/portrait/lines';

// De la fiche enregistrée (portrait/fiche.ts) aux mots de l'écran « Ma fiche » : ce qui se calcule avant d'écrire une
// phrase. Module pur, que le navigateur lit : il n'importe du serveur que des types.

// Les longueurs des textes que la personne corrige : la forme des lignes (portrait/lines.ts) et les champs de l'écran
// lisent les mêmes.
export const FICHE_MAX = { role: 300, titre: 80, detail: 300, signature: 2000 } as const;

export type Ligne<G extends Genre> = Omit<FicheLine, 'genre' | 'valeur'> & {
  genre: G;
  valeur: ValeurDe<G>;
};

// Les lignes d'un genre. readFiche a validé chaque valeur dans la forme de son genre : le type ne fait que le redire.
export const linesOf = <G extends Genre>(lines: FicheLine[], genre: G): Ligne<G>[] =>
  lines.filter((line) => line.genre === genre) as Ligne<G>[];

const localeTag = (locale: string) => (locale === 'en' ? 'en-US' : 'fr-FR');

// Les heures (0 à 23) ou les jours (lundi d'abord) où elle écrit le plus : ceux qui comptent au moins la moitié des
// mails du plus chargé.
const busiest = (counts: number[]): number[] => {
  const floor = Math.max(0, ...counts) / 2;
  return counts.flatMap((count, index) => (count > 0 && count >= floor ? [index] : []));
};

// Ses plages d'envoi : les heures les plus chargées, recollées quand elles se suivent. [9, 12] : de 9 h à 12 h.
export function busyHours(heures: number[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const hour of busiest(heures)) {
    const last = ranges.at(-1);
    if (last?.[1] === hour) last[1] = hour + 1;
    else ranges.push([hour, hour + 1]);
  }
  return ranges;
}

// Ses jours d'envoi les plus chargés, de 0 (lundi) à 6 (dimanche).
export const busyDays = (jours: number[]): number[] => busiest(jours);

// « 9 h », « 9 AM ». 24 est minuit, comme 0.
export function formatHour(hour: number, locale: string): string {
  const h = hour % 24;
  return locale === 'en' ? `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}` : `${h} h`;
}

// « lundi », « Monday » : le 1er janvier 2024 est un lundi.
export const weekdayName = (day: number, locale: string): string =>
  new Intl.DateTimeFormat(localeTag(locale), { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2024, 0, 1 + day)),
  );

// « lundi, mardi et jeudi », « Monday, Tuesday, and Thursday ».
export const joinList = (items: string[], locale: string): string =>
  new Intl.ListFormat(localeTag(locale), { type: 'conjunction' }).format(items);

// Un délai en minutes dans l'unité où il se lit : des minutes sous une heure, des heures sous deux jours, puis des
// jours.
export function delayOf(minutes: number): { unit: 'minutes' | 'hours' | 'days'; n: number } {
  if (minutes < 60) return { unit: 'minutes', n: Math.round(minutes) };
  if (minutes < 48 * 60) return { unit: 'hours', n: Math.round(minutes / 60) };
  return { unit: 'days', n: Math.round(minutes / (24 * 60)) };
}

// Une part de 0 à 1, en pour cent entiers.
export const percent = (part: number): number => Math.round(part * 100);

// Les langues de ses mails et leur part en pour cent, la plus fréquente d'abord ; une langue sans mail n'y est pas.
export function languageShares(
  langues: ValeurDe<'langues'>,
): Array<{ langue: keyof ValeurDe<'langues'>; part: number }> {
  const entries = Object.entries(langues) as Array<[keyof ValeurDe<'langues'>, number]>;
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  return entries
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([langue, count]) => ({ langue, part: percent(count / total) }));
}
