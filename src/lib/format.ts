const TIME_ZONE = 'Europe/Paris';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const localeTag = (locale: string) => (locale === 'en' ? 'en-US' : 'fr-FR');

export const formatDate = (date: Date, locale = 'fr'): string =>
  new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);

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

export function formatRelative(date: Date, now: Date = new Date(), locale = 'fr'): string {
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE) return locale === 'en' ? 'just now' : "à l'instant";
  const relative = new Intl.RelativeTimeFormat(localeTag(locale), { numeric: 'auto' });
  if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), 'minute');
  if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), 'hour');
  if (elapsed < 2 * DAY) return relative.format(-1, 'day');
  return formatDate(date, locale);
}
