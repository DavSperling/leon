// Formats français de l'interface, à l'heure de Paris, relatifs à un « maintenant » FIXE : captures déterministes.
export const NOW = new Date('2026-10-21T11:00:00+02:00');

const TZ = 'Europe/Paris';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const dateFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }); // « 2026-10-21 » : le jour civil à Paris
const numberFmt = new Intl.NumberFormat('fr-FR');

const toDate = (d: Date | string): Date => (typeof d === 'string' ? new Date(d) : d);

/** « 12 oct. 2026 » */
export const formatDate = (d: Date | string): string => dateFmt.format(toDate(d));
/** « 14:12 » */
export const formatTime = (d: Date | string): string => timeFmt.format(toDate(d));
/** « 12 oct. 2026, 14:12 » (assemblé à la main : l'ICU du navigateur écrit parfois « à ») */
export const formatDateTime = (d: Date | string): string => `${formatDate(d)}, ${formatTime(d)}`;
/** « 1 234 » (espace fine insécable de fr-FR) */
export const formatNumber = (n: number): string => numberFmt.format(n);

const NBSP = '\u00a0';
/** « à l'instant », « il y a 4 min », « il y a 2 h », « hier », puis la date ; insécable : jamais « il y a 18 / min » en fin de ligne. */
export function formatRelative(d: Date | string, now: Date = NOW): string {
  const date = toDate(d);
  const elapsed = now.getTime() - date.getTime();
  const ago = (n: number, unit: string) => ['il', 'y', 'a', n, unit].join(NBSP);
  if (elapsed < MINUTE) return `à${NBSP}l’instant`;
  if (elapsed < HOUR) return ago(Math.floor(elapsed / MINUTE), 'min');
  if (elapsed < DAY) return ago(Math.floor(elapsed / HOUR), 'h');
  const yesterday = new Date(Date.parse(`${dayFmt.format(now)}T12:00:00Z`) - DAY);
  if (dayFmt.format(date) === dayFmt.format(yesterday)) return 'hier';
  return formatDate(date);
}

/** Comme formatRelative, mais « le 12 oct. 2026 » pour une date nue : « dernier passage le 12 oct. 2026 ». */
export function formatSince(d: Date | string, now: Date = NOW): string {
  const r = formatRelative(d, now);
  return /^\d/.test(r) ? `le ${r}` : r;
}

/** Une date à Paris écrite « 2026-10-14 14:02 » (heure d'été : toutes les données fictives sont entre avril et le 21 octobre). */
export const paris = (s: string): Date => new Date(`${s.replace(' ', 'T')}:00+02:00`);
/** NOW moins tant de minutes. */
export const minutesAgo = (m: number): Date => new Date(NOW.getTime() - m * MINUTE);

console.assert(
  formatRelative(minutesAgo(4)) === 'il\u00a0y\u00a0a\u00a04\u00a0min' && formatRelative(minutesAgo(130)) === 'il\u00a0y\u00a0a\u00a02\u00a0h' &&
    formatRelative(paris('2026-10-20 09:00')) === 'hier' && formatDateTime(paris('2026-10-12 14:12')) === '12 oct. 2026, 14:12',
  'format.ts : formats relatifs incorrects',
);
