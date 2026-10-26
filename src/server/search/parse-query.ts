import { ITEM_NATURES, type ItemNature, SOURCE_KINDS, type SourceKind } from '@/capture/turn';
import { stripHighlightMarks } from '@/lib/highlight';
import { SOURCE_KIND_LABELS } from '@/server/memory/labels';
import { type ParsedQuery, QUERY_MAX_CHARS } from './types';

// Lecture de ce que l'utilisateur tape dans la barre (C4). Pur : ni base, ni réseau, jamais d'exception.
//
//   de:<nom|e-mail|identifiant>   répétable ; une valeur à espaces s'écrit entre guillemets : de:"Julie Martin"
//   outil:<identifiant|libellé>   répétable : outil:github, outil:"Claude Code"
//   type:<nature>                 répétable : type:réunion, type:tickets
//   depuis:<N>j|<N>s|<N>m|AAAA-MM-JJ   jours, semaines, mois, ou une date (UTC, incluse)
//   avant:AAAA-MM-JJ              une date (UTC, exclue)
//   "phrase exacte"               passe telle quelle au texte
//
// Un filtre vide, inconnu ou mal formé est ignoré, et retiré du texte. Le texte garde ses guillemets
// appariés et se limite à QUERY_MAX_CHARS caractères.

// Entrée lue au plus : une requête de 2 000 caractères collés ne coûte rien, une de plusieurs mégaoctets non plus.
const RAW_MAX_CHARS = 10_000;
// Valeurs gardées par filtre : une requête ne fabrique pas une clause SQL de plusieurs milliers de termes.
const VALUES_MAX = 10;
const PERSON_MAX_CHARS = 100;
const DURATION_MAX = 9999;

const FILTER_KEY = /^(de|from|outil|tool|type|depuis|since|avant|before):/i;
const FILTER_ALIASES: Record<string, string> = {
  from: 'de',
  tool: 'outil',
  since: 'depuis',
  before: 'avant',
};
// Les caractères de contrôle (dont NUL, que Postgres refuse dans un texte) valent une espace.
const CONTROL_CHARS = /\p{Cc}/gu;

// Sans casse, sans accent, sans ponctuation : « Help Scout », « help-scout » et « helpscout » se confondent.
function squash(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

const KIND_BY_NAME = new Map<string, SourceKind>();
for (const kind of SOURCE_KINDS) {
  KIND_BY_NAME.set(squash(kind), kind);
  KIND_BY_NAME.set(squash(SOURCE_KIND_LABELS[kind]), kind);
}

const NATURE_BY_NAME = new Map<string, ItemNature>(ITEM_NATURES.map((n) => [squash(n), n]));
for (const [english, french] of Object.entries({
  meeting: 'reunion',
  thread: 'fil',
  email: 'mail',
  file: 'fichier',
  event: 'evenement',
  'code change': 'commit',
  'ai conversation': 'conversation',
})) {
  const nature = ITEM_NATURES.find((item) => item === french);
  if (nature) NATURE_BY_NAME.set(squash(english), nature);
}

function toKind(value: string): SourceKind | null {
  return KIND_BY_NAME.get(squash(value)) ?? null;
}

// « tickets » comme « ticket » : le pluriel d'un type s'accepte.
function toNature(value: string): ItemNature | null {
  const name = squash(value);
  return NATURE_BY_NAME.get(name) ?? NATURE_BY_NAME.get(name.replace(/s$/, '')) ?? null;
}

function utcDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? date : null;
}

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? utcDate(Number(match[1]), Number(match[2]), Number(match[3])) : null;
}

// `now` moins N mois : le même jour du mois d'arrivée, ou son dernier jour s'il n'a pas ce quantième.
function monthsBefore(now: Date, months: number): Date {
  const date = new Date(now);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date;
}

function parseSince(value: string, now: Date): Date | null {
  const duration = /^(\d{1,4})(mo|[jsmdw])$/i.exec(value);
  if (!duration) return parseDate(value);
  const amount = Number(duration[1]);
  if (amount < 1 || amount > DURATION_MAX) return null;
  const unit = (duration[2] as string).toLowerCase();
  if (unit === 'm' || unit === 'mo') return monthsBefore(now, amount);
  const days = unit === 's' || unit === 'w' ? amount * 7 : amount;
  return new Date(now.getTime() - days * 86_400_000);
}

type Scanner = { raw: string; at: number };

function skipSpaces(scan: Scanner): void {
  while (scan.at < scan.raw.length && /\s/.test(scan.raw.charAt(scan.at))) scan.at += 1;
}

// Lit un mot jusqu'à la prochaine espace.
function readWord(scan: Scanner): string {
  const start = scan.at;
  while (scan.at < scan.raw.length && !/\s/.test(scan.raw.charAt(scan.at))) scan.at += 1;
  return scan.raw.slice(start, scan.at);
}

// Lit la valeur d'un filtre : entre guillemets (jusqu'au guillemet fermant), ou un mot. Un guillemet qui ne
// se ferme pas ouvre une valeur qui va jusqu'à l'espace.
function readValue(scan: Scanner): string {
  if (scan.raw.charAt(scan.at) === '"') {
    const close = scan.raw.indexOf('"', scan.at + 1);
    if (close !== -1) {
      const value = scan.raw.slice(scan.at + 1, close);
      scan.at = close + 1;
      return value;
    }
    scan.at += 1;
  }
  return readWord(scan);
}

function tidy(value: string): string {
  return value.replace(/"/g, ' ').replace(/\s+/g, ' ').trim();
}

function pushUnique<T>(list: T[], value: T): void {
  if (list.length < VALUES_MAX && !list.includes(value)) list.push(value);
}

// Coupe à `max` unités sans séparer les deux moitiés d'un caractère hors du plan de base (émoji).
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const high = text.charCodeAt(max - 1);
  return text.slice(0, high >= 0xd800 && high <= 0xdbff ? max - 1 : max);
}

// Un nombre impair de guillemets : le dernier, qui ne se ferme pas, disparaît.
function balanceQuotes(text: string): string {
  const quotes = text.split('"').length - 1;
  if (quotes % 2 === 0) return text;
  const last = text.lastIndexOf('"');
  return `${text.slice(0, last)}${text.slice(last + 1)}`;
}

export function parseQuery(raw: string, now: Date): ParsedQuery {
  const scan: Scanner = {
    raw: stripHighlightMarks(raw.slice(0, RAW_MAX_CHARS)).replace(CONTROL_CHARS, ' '),
    at: 0,
  };
  const words: string[] = [];
  const people: string[] = [];
  const tools: SourceKind[] = [];
  const natures: ItemNature[] = [];
  let since: Date | null = null;
  let until: Date | null = null;

  for (;;) {
    skipSpaces(scan);
    if (scan.at >= scan.raw.length) break;
    if (scan.raw.charAt(scan.at) === '"') {
      const close = scan.raw.indexOf('"', scan.at + 1);
      if (close === -1) {
        scan.at += 1; // guillemet non fermé : ignoré, le reste se lit comme des mots
        continue;
      }
      const phrase = scan.raw.slice(scan.at, close + 1);
      scan.at = close + 1;
      if (tidy(phrase) !== '') words.push(phrase);
      continue;
    }
    const key = FILTER_KEY.exec(scan.raw.slice(scan.at, scan.at + 8));
    if (!key) {
      words.push(readWord(scan));
      continue;
    }
    scan.at += key[0].length;
    const value = tidy(readValue(scan));
    if (value === '') continue;
    switch (FILTER_ALIASES[(key[1] as string).toLowerCase()] ?? (key[1] as string).toLowerCase()) {
      case 'de':
        pushUnique(people, value.slice(0, PERSON_MAX_CHARS));
        break;
      case 'outil': {
        const kind = toKind(value);
        if (kind) pushUnique(tools, kind);
        break;
      }
      case 'type': {
        const nature = toNature(value);
        if (nature) pushUnique(natures, nature);
        break;
      }
      case 'depuis':
        since = parseSince(value, now) ?? since;
        break;
      case 'avant':
        until = parseDate(value) ?? until;
        break;
    }
  }

  const text = balanceQuotes(truncate(words.join(' '), QUERY_MAX_CHARS)).trim();
  return {
    text,
    people,
    filters: {
      ...(tools.length > 0 ? { tools } : {}),
      ...(natures.length > 0 ? { natures } : {}),
      ...(since ? { since } : {}),
      ...(until ? { until } : {}),
    },
  };
}
