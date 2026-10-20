// La date de la requête JQL : Jira la lit à la minute, dans le fuseau du compte qui interroge
// (« your configured time zone », qui est celui de l'instance tant que le compte n'a pas choisi le
// sien). `GET /myself` rend ce fuseau.

// Le fuseau le plus à l'ouest est UTC-12 : écrire l'heure UTC douze heures plus tôt donne, dans
// n'importe quel fuseau, un instant qui ne dépasse pas celui voulu. On relit plus, on ne perd rien.
const UNKNOWN_ZONE_LOOKBACK_MS = 12 * 3_600_000;

function isTimeZone(value: string | null | undefined): value is string {
  if (value === undefined || value === null) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// AAAA-MM-JJ HH:mm dans le fuseau.
function minuteIn(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23', // minuit s'écrit 00, jamais 24
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

export function updatedSinceJql(from: Date, timeZone: string | null | undefined): string {
  const minute = isTimeZone(timeZone)
    ? minuteIn(from, timeZone)
    : minuteIn(new Date(from.getTime() - UNKNOWN_ZONE_LOOKBACK_MS), 'UTC');
  return `updated >= "${minute}" ORDER BY updated ASC`;
}
