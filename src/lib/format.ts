// Formats français de l'interface. Les dates s'écrivent à l'heure de Paris, quel que soit le fuseau du serveur.
export const LOCALE = 'fr-FR';
export const TIME_ZONE = 'Europe/Paris';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const numberFormat = new Intl.NumberFormat(LOCALE);

// « 12 oct. 2026 »
export const formatDate = (date: Date): string => dateFormat.format(date);

// « 12 oct. 2026, 14:12 »
export const formatDateTime = (date: Date): string => dateTimeFormat.format(date);

export const formatNumber = (value: number): string => numberFormat.format(value);

// « à l'instant », « il y a 4 min », « il y a 2 h », « hier », puis la date.
export function formatRelative(date: Date, now: Date = new Date()): string {
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE) return "à l'instant";
  if (elapsed < HOUR) return `il y a ${Math.floor(elapsed / MINUTE)} min`;
  if (elapsed < DAY) return `il y a ${Math.floor(elapsed / HOUR)} h`;
  if (elapsed < 2 * DAY) return 'hier';
  return formatDate(date);
}
