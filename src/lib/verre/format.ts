// Formats de la maquette : ceux de src/lib/format.ts (déjà testés), plus l'heure seule et « depuis ».
import { formatDate, formatRelative } from '@/lib/format';

export { formatDate, formatDateTime, formatNumber, formatRelative } from '@/lib/format';

const timeFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
});

// « 14:12 », à l'heure de Paris.
export const formatTime = (date: Date): string => timeFormat.format(date);

// Comme formatRelative, mais « le 12 oct. 2026 » pour une date nue : « dernier passage le 12 oct. 2026 »
// (« on Oct 12, 2026 » en anglais, où la date ne commence pas par un chiffre).
export function formatSince(date: Date, now: Date = new Date(), locale = 'fr'): string {
  const r = formatRelative(date, now, locale);
  return r === formatDate(date, locale) ? `${locale === 'en' ? 'on' : 'le'} ${r}` : r;
}
