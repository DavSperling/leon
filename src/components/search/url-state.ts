// L'état de la barre de recherche dans l'adresse de la page (`/?q=…&page=2`), et les réécritures de la requête
// que font les puces de filtre. Pur : ni base, ni serveur, ni navigateur, pour que la page (côté serveur) et les
// composants (côté navigateur) s'en servent de la même façon.

// Identifiant de la zone de saisie : ⌘K la retrouve par lui pour y mettre le curseur (command-search.tsx).
export const SEARCH_INPUT_ID = 'barre-de-recherche';

// Longueur maximale de la requête, filtres compris (QUERY_MAX_CHARS de server/search/types.ts : la recherche
// n'en garde que 300 de texte). Même plafond de pages que la recherche (PAGE_MAX de server/search/search.ts) :
// au-delà, elle répond avec la dernière page.
export const QUERY_MAX_CHARS = 300;
const PAGE_MAX = 50;

// Les deux caractères dont Postgres entoure les mots trouvés (src/lib/highlight.ts) : jamais dans une requête.
const HIGHLIGHT_MARKS = /[]/g;
const CONTROL_CHARS = /\p{Cc}/gu;

export type SearchUrlState = { q: string; page: number };

type ParamValue = string | string[] | undefined;
type ParamSource = Record<string, ParamValue> | URLSearchParams;

function firstValue(source: ParamSource, name: string): string | undefined {
  const value = source instanceof URLSearchParams ? (source.get(name) ?? undefined) : source[name];
  return Array.isArray(value) ? value[0] : value;
}

// Coupe à `max` unités sans séparer les deux moitiés d'un caractère hors du plan de base (émoji).
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const high = text.charCodeAt(max - 1);
  return text.slice(0, high >= 0xd800 && high <= 0xdbff ? max - 1 : max);
}

// Ce que l'adresse dit, en ne croyant rien : une page qui n'est pas un entier positif vaut 1, une requête
// trop longue est coupée. `searchParams` de Next donne une chaîne, une liste (paramètre répété) ou rien.
export function fromSearchParams(source: ParamSource): SearchUrlState {
  const q = truncate((firstValue(source, 'q') ?? '').replace(HIGHLIGHT_MARKS, ''), QUERY_MAX_CHARS);
  const rawPage = firstValue(source, 'page') ?? '';
  const page = /^\d+$/.test(rawPage) ? Math.min(Number(rawPage), PAGE_MAX) : 1;
  return { q, page: page >= 1 ? page : 1 };
}

// L'inverse : rien d'écrit pour une requête vide ni pour la page 1.
export function toSearchParams(state: { q?: string; page?: number }): URLSearchParams {
  const params = new URLSearchParams();
  const q = truncate(state.q ?? '', QUERY_MAX_CHARS);
  if (q.trim() === '') return params;
  params.set('q', q);
  if (state.page !== undefined && Number.isInteger(state.page) && state.page > 1) {
    params.set('page', String(Math.min(state.page, PAGE_MAX)));
  }
  return params;
}

// L'adresse de la page d'accueil pour cet état.
export function searchHref(state: { q?: string; page?: number }): string {
  const query = toSearchParams(state).toString();
  return query === '' ? '/' : `/?${query}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Les filtres écrits dans la requête, lus comme `parseQuery` (server/search/parse-query.ts) les lit : une clé en
// début de mot, une valeur d'un mot ou entre guillemets, une phrase entre guillemets laissée telle quelle, un
// guillemet non fermé ignoré. Un test compare les deux lectures.

export const FILTER_KEYS = ['de', 'outil', 'type', 'depuis', 'avant'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

const FILTER_KEY = /^(de|outil|type|depuis|avant):/i;
// `depuis` et `avant` n'ont qu'une valeur ; les autres s'additionnent.
const SINGLE_VALUED: ReadonlySet<FilterKey> = new Set(['depuis', 'avant']);

export type FilterToken = { key: FilterKey; value: string; start: number; end: number };

// Sans casse, sans accent, sans ponctuation : « Claude Code », « claude_code » et « claudecode » se confondent.
function squash(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function tidy(value: string): string {
  return value.replace(/"/g, ' ').replace(/\s+/g, ' ').trim();
}

// Les filtres de la requête dans l'ordre, avec leur emplacement (`start` inclus, `end` exclu). Un filtre sans
// valeur n'est pas un filtre : la recherche l'ignore.
export function filterTokens(q: string): FilterToken[] {
  // Mêmes caractères de contrôle qu'à la recherche (une espace chacun : les emplacements restent ceux de `q`).
  const text = q.replace(CONTROL_CHARS, ' ');
  const tokens: FilterToken[] = [];
  const space = /\s/;
  let at = 0;
  const readWord = (): string => {
    const from = at;
    while (at < text.length && !space.test(text.charAt(at))) at += 1;
    return text.slice(from, at);
  };
  while (at < text.length) {
    if (space.test(text.charAt(at))) {
      at += 1;
      continue;
    }
    if (text.charAt(at) === '"') {
      const close = text.indexOf('"', at + 1);
      at = close === -1 ? at + 1 : close + 1;
      continue;
    }
    const match = FILTER_KEY.exec(text.slice(at, at + 8));
    if (!match) {
      readWord();
      continue;
    }
    const start = at;
    at += match[0].length;
    let raw: string;
    const close = text.charAt(at) === '"' ? text.indexOf('"', at + 1) : -1;
    if (close !== -1) {
      raw = text.slice(at + 1, close);
      at = close + 1;
    } else {
      if (text.charAt(at) === '"') at += 1;
      raw = readWord();
    }
    const value = tidy(raw);
    if (value !== '') {
      tokens.push({ key: (match[1] as string).toLowerCase() as FilterKey, value, start, end: at });
    }
  }
  return tokens;
}

const sameFilter = (token: FilterToken, key: FilterKey, value: string) =>
  token.key === key && squash(token.value) === squash(value);

export function hasFilter(q: string, key: FilterKey, value: string): boolean {
  return filterTokens(q).some((token) => sameFilter(token, key, value));
}

// Retire de la requête chaque filtre de cette clé et de cette valeur ; le reste est laissé tel quel.
export function withoutFilter(q: string, key: FilterKey, value: string): string {
  return removeTokens(
    q,
    filterTokens(q).filter((token) => sameFilter(token, key, value)),
  );
}

function removeTokens(q: string, tokens: FilterToken[]): string {
  let result = q;
  // De la fin vers le début : les emplacements des filtres restants ne bougent pas.
  for (const token of tokens.toSorted((a, b) => b.start - a.start)) {
    const before = result.slice(0, token.start).replace(/\s+$/, '');
    const after = result.slice(token.end).replace(/^\s+/, '');
    result = before !== '' && after !== '' ? `${before} ${after}` : `${before}${after}`;
  }
  return result;
}

function formatValue(value: string): string {
  const clean = tidy(value);
  return /\s/.test(clean) ? `"${clean}"` : clean;
}

// Ajoute le filtre en tête de la requête : un guillemet non fermé plus loin dans le texte n'avalerait pas un
// filtre mis après lui. Un filtre déjà là n'est pas répété ; une date remplace l'ancienne.
export function withFilter(q: string, key: FilterKey, value: string): string {
  const clean = tidy(value);
  if (clean === '') return q.trim();
  if (hasFilter(q, key, clean)) return q;
  const base = SINGLE_VALUED.has(key)
    ? removeTokens(
        q,
        filterTokens(q).filter((token) => token.key === key),
      )
    : q;
  const rest = base.trim();
  const filter = `${key}:${formatValue(clean)}`;
  return rest === '' ? filter : `${filter} ${rest}`;
}
