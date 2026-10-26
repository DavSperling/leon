// Formats de l'interface, en français sauf `locale` 'en'. Les dates s'écrivent à l'heure de Paris, quel que soit le
// fuseau du serveur.
const TIME_ZONE = 'Europe/Paris';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const localeTag = (locale: string) => (locale === 'en' ? 'en-US' : 'fr-FR');
// « 2026-10-13 » : le jour civil à Paris.
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });

// « 12 oct. 2026 »
export const formatDate = (date: Date, locale = 'fr'): string =>
  new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);

// « 12 oct. 2026, 14:12 »
export const formatDateTime = (date: Date, locale = 'fr'): string =>
  new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

export const formatNumber = (value: number, locale = 'fr'): string =>
  new Intl.NumberFormat(localeTag(locale)).format(value);

// « à l'instant », « il y a 4 min », « il y a 2 h », « hier », puis la date.
export function formatRelative(date: Date, now: Date = new Date(), locale = 'fr'): string {
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE) return locale === 'en' ? 'just now' : "à l'instant";
  // Intl met une espace insécable avant l'unité (« 4 min ») ; l'interface écrit une espace simple.
  const relative = (value: number, unit: Intl.RelativeTimeFormatUnit) =>
    new Intl.RelativeTimeFormat(localeTag(locale), { style: 'short', numeric: 'auto' })
      .format(-value, unit)
      .replace(/ /g, ' ');
  if (elapsed < HOUR) return relative(Math.floor(elapsed / MINUTE), 'minute');
  if (elapsed < DAY) return relative(Math.floor(elapsed / HOUR), 'hour');
  // « hier » : la veille en jour civil à Paris (midi la veille sert de repère, sans souci d'heure d'été).
  const yesterday = new Date(Date.parse(`${dayFormat.format(now)}T12:00:00Z`) - DAY);
  if (dayFormat.format(date) === dayFormat.format(yesterday)) return relative(1, 'day');
  return formatDate(date, locale);
}
