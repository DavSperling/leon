// Le calendrier de la semaine sur l'Accueil : les rendez-vous, à l'heure de Paris comme le reste de l'interface
// (src/lib/format.ts). Une heure s'écrit « 2026-11-17T14:00 », un jour entier « 2026-11-17 » : l'ordre alphabétique
// est l'ordre du temps, et le jour se lit dans les dix premiers caractères.

const TIME_ZONE = 'Europe/Paris';
const DAY_MS = 24 * 60 * 60 * 1000;

export const PARIS_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

// Un rendez-vous tel que gardé dans `agendas` (0072).
export type StoredRendezVous = {
  titre: string;
  debut: string;
  fin?: string;
  avec?: string;
  sourceId: string;
};

// Ce que l'Accueil montre : l'outil et le lien de la source en plus.
export type RendezVous = {
  titre: string;
  debut: string;
  fin: string | null;
  avec: string | null;
  sourceId: string;
  outil: string;
  lien: string | null;
};

const wallFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// L'heure de Paris d'un instant : « 2026-11-17T14:00 ».
export function parisTime(instant: Date): string {
  const part = Object.fromEntries(wallFormat.formatToParts(instant).map((p) => [p.type, p.value]));
  return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}`;
}

const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

// Les sept jours (« 2026-11-16 »…) de la semaine de Paris qui contient `now`, du lundi au dimanche.
export function weekDays(now: Date): string[] {
  const today = parisTime(now).slice(0, 10);
  const monday = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

// Du plus tôt au plus tard ; un jour entier passe avant les heures de son jour.
export const byStart = (a: { debut: string }, b: { debut: string }): number =>
  a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : 0;
