import { formatDate, formatNumber, minutesAgo, NOW } from '@/lib/format';
import { nb } from '@/lib/nb';
import { fold, HL_END, HL_START, markPhrase, markTerms } from '@/lib/text';
import { CORPUS, type CorpusItem } from './corpus';
import { findPeople, ME, type Person } from './people';
import { CAPTURE_CHANNELS, kindLabel, NATURE_LABELS, NATURES, type Nature, PROVIDERS, type SourceKind } from './providers';

// Recherche fictive mais déterministe sur CORPUS, avec la syntaxe du vrai Leon (tout passe par la requête) :
//   de:<nom|e-mail>  outil:<outil>  type:<nature>  depuis:7j|2s|3m|AAAA-MM-JJ  avant:AAAA-MM-JJ  "phrase exacte"

export const PAGE_SIZE = 10;
export type FilterKey = 'de' | 'outil' | 'type' | 'depuis' | 'avant';
export type AnswerState = 'ok' | 'not-enough' | 'unavailable';

export type ActiveFilter = {
  key: FilterKey;
  value: string;
  /** « Outil : GitHub », « Depuis : 7 jours », « Personne : julie » */
  label: string;
  /** Faux : la recherche ignore ce filtre (outil, type ou durée inconnus) → puce d'avertissement. */
  recognized: boolean;
  /** La requête sans ce filtre (lien de la croix). */
  removeQuery: string;
};

export type Passage = { turn: number; author: string; date: Date; /** texte marqué U+E000…U+E001 */ snippet: string };
export type PreviewTurn = { speaker: string; at: Date; /** texte marqué */ text: string; matching: boolean };
export type SearchResult = {
  /** Rang global (1, 2, …) : les renvois [n] de la réponse visent ce rang. */
  n: number;
  id: string;
  kind: SourceKind;
  kindLabel: string;
  nature: Nature;
  natureLabel: string;
  origin: string;
  title: string | null;
  url: string | null;
  author: string;
  date: Date;
  passages: Passage[];
  preview: PreviewTurn[];
};
export type SearchResponse = {
  query: string;
  page: number;
  results: SearchResult[];
  total: number;
  pages: number;
  /** Texte avec renvois [n] (rangs de la page 1), ou null. */
  answer: string | null;
  /** Utile seulement en page 1 avec des résultats (sinon la boîte de réponse est cachée). */
  answerState: AnswerState;
  unknownPeople: string[];
  unknownFilters: ActiveFilter[];
  activeFilters: ActiveFilter[];
  /** Durée affichée « 142 ms », stable pour une requête donnée. */
  tookMs: number;
};

export type ExtraFilters = { people?: string[]; tools?: SourceKind[]; natures?: Nature[]; since?: Date; until?: Date };

// ---------- Lecture de la requête ----------

type Token = { key: FilterKey; value: string; start: number; end: number };
const KEYS: FilterKey[] = ['de', 'outil', 'type', 'depuis', 'avant'];
const squash = (s: string) => fold(s).replace(/[^\p{L}\p{N}]/gu, '');

/** Les filtres écrits dans la requête, dans l'ordre, avec leur position. */
export function filterTokens(q: string): Token[] {
  const out: Token[] = [];
  const re = /(?<=^|\s)(de|outil|type|depuis|avant):("([^"]*)"|\S*)/gi;
  for (const m of q.matchAll(re)) {
    const value = (m[3] ?? m[2] ?? '').trim();
    if (value) out.push({ key: m[1]!.toLowerCase() as FilterKey, value, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function freeText(q: string): { words: string[]; phrases: string[] } {
  let rest = q;
  for (const t of filterTokens(q).reverse()) rest = rest.slice(0, t.start) + rest.slice(t.end);
  const phrases = [...rest.matchAll(/"([^"]+)"/g)].map((m) => m[1]!.trim()).filter(Boolean);
  const words = rest.replace(/"[^"]*"/g, ' ').replace(/"/g, ' ').split(/[\s,;:?!.«»()]+/).filter(Boolean);
  return { words, phrases };
}

const STOP = new Set(
  ('a au aux avec ce ces cette dans de des du elle en est et il ils je la le les leur lui ma mais me mes moi mon ne nos notre nous on ou où par pas pour qu que quel quelle quels qui quoi sa se ses son sur ta te tes toi ton tu un une vos votre vous y ont été être fait faire a-t-on t on-il l d j c s n qu’ l’ d’ ça comment quand combien').split(' '),
);
const termsOf = (words: string[]) => words.map((w) => w.replace(/^[ldjcnsmt]['’]/i, '')).filter((w) => w.length > 1 && !STOP.has(fold(w)));

const toolByName = new Map<string, SourceKind>();
for (const p of PROVIDERS) (toolByName.set(squash(p.id), p.id), toolByName.set(squash(p.label), p.id));
for (const c of CAPTURE_CHANNELS) (toolByName.set(squash(c.id), c.id), toolByName.set(squash(c.label), c.id));
const toNature = (v: string): Nature | undefined => {
  const s = squash(v);
  return NATURES.find((n) => n === s || n === s.replace(/s$/, '') || squash(NATURE_LABELS[n]) === s);
};

const DAY = 86_400_000;
/** « 2026-10-01 » → minuit UTC de ce jour, comme le vrai Leon ; une date impossible ne vaut rien. */
function parseDate(v: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return undefined;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? d : undefined;
}
function parseSince(v: string): Date | undefined {
  const m = /^(\d{1,4})([jsm])$/i.exec(v);
  if (!m) return parseDate(v);
  const n = Number(m[1]);
  if (n < 1) return undefined;
  const unit = m[2]!.toLowerCase();
  if (unit === 'm') {
    const d = new Date(NOW);
    d.setMonth(d.getMonth() - n);
    return d;
  }
  return new Date(NOW.getTime() - n * (unit === 's' ? 7 : 1) * DAY);
}
const UNITS: Record<string, [string, string]> = { j: ['jour', 'jours'], s: ['semaine', 'semaines'], m: ['mois', 'mois'] };
const KEY_LABELS: Record<FilterKey, string> = { de: 'Personne', outil: 'Outil', type: 'Type', depuis: 'Depuis', avant: 'Avant' };

function describe(t: Token): { text: string; recognized: boolean } {
  switch (t.key) {
    case 'de':
      return { text: t.value, recognized: true };
    case 'outil': {
      const k = toolByName.get(squash(t.value));
      return { text: k ? kindLabel(k) : t.value, recognized: Boolean(k) };
    }
    case 'type': {
      const n = toNature(t.value);
      return { text: n ? NATURE_LABELS[n] : t.value, recognized: Boolean(n) };
    }
    case 'depuis': {
      const m = /^(\d{1,4})([jsm])$/i.exec(t.value);
      const d = parseSince(t.value);
      if (m && d) {
        const [one, many] = UNITS[m[2]!.toLowerCase()]!;
        return { text: `${Number(m[1])} ${Number(m[1]) === 1 ? one : many}`, recognized: true };
      }
      return { text: d ? formatDate(d) : t.value, recognized: Boolean(d) };
    }
    case 'avant': {
      const d = parseDate(t.value);
      return { text: d ? formatDate(d) : t.value, recognized: Boolean(d) };
    }
  }
}

// ---------- Réécriture de la requête (puces et menus de filtres) ----------

const writeValue = (v: string) => (/\s/.test(v) ? `"${v}"` : v);
const same = (t: Token, key: FilterKey, value: string) => t.key === key && squash(t.value) === squash(value);

/** La requête contient-elle ce filtre ? (`outil:github` ≡ `outil:GitHub`) */
export const hasFilter = (q: string, key: FilterKey, value: string): boolean => filterTokens(q).some((t) => same(t, key, value));

/** La requête sans ce filtre. */
export function withoutFilter(q: string, key: FilterKey, value: string): string {
  let out = q;
  for (const t of filterTokens(q).reverse()) if (same(t, key, value)) out = out.slice(0, t.start) + out.slice(t.end);
  return out.replace(/\s+/g, ' ').trim();
}

/** La requête avec ce filtre en plus ; `depuis` et `avant` n'ont qu'une valeur, la nouvelle remplace l'ancienne. */
export function withFilter(q: string, key: FilterKey, value: string): string {
  let base = q;
  if (key === 'depuis' || key === 'avant') for (const t of filterTokens(q).filter((t) => t.key === key)) base = withoutFilter(base, key, t.value);
  else if (hasFilter(q, key, value)) return q;
  return `${base.trim()} ${key}:${writeValue(value)}`.trim();
}

/** Les filtres actifs de la requête, en puces. */
export function activeFilters(q: string): ActiveFilter[] {
  return filterTokens(q).map((t) => {
    const { text, recognized } = describe(t);
    return { key: t.key, value: t.value, label: nb(`${KEY_LABELS[t.key]} : ${text}`), recognized, removeQuery: withoutFilter(q, t.key, t.value) };
  });
}

// ---------- Recherche ----------

const stemsOf = (terms: string[]) => terms.map((t) => fold(t).replace(/(s|x)$/, '').slice(0, 7));
// Un nom propre (écrit en capitales, ou connu) pèse double : « ACME » départage mieux que « contrat ».
const ENTITIES = new Set(['acme', 'ovh', 'nova', 'zephyr', 'scaleway', 'saml', 'sso', 'camille']);
const weightOf = (term: string) => (/^[\p{Lu}\d-]{2,}$/u.test(term) || ENTITIES.has(fold(term)) ? 2 : 1);
const hits = (text: string, stems: string[]) => {
  const words = fold(text).split(/[^\p{L}\p{N}]+/u);
  return stems.filter((s) => words.some((w) => w.startsWith(s)));
};
const speakerIs = (speaker: string, p: Person) => speaker === p.name || (p.id === ME.id && speaker === 'Vous');

type Scored = { item: CorpusItem; score: number; matched: Set<string>; turns: number[] };

export function search(query: string, opts: { page?: number; filters?: ExtraFilters; force?: AnswerState } = {}): SearchResponse {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const tokens = filterTokens(query);
  const filters = activeFilters(query);
  const { words, phrases } = freeText(query);
  const terms = termsOf(words);
  const stems = stemsOf(terms);
  const weights = new Map(stems.map((st, i) => [st, weightOf(terms[i]!)]));

  const people: Person[] = [];
  const unknownPeople: string[] = [];
  const tools = new Set<SourceKind>(opts.filters?.tools);
  const natures = new Set<Nature>(opts.filters?.natures);
  let since = opts.filters?.since;
  let until = opts.filters?.until;
  for (const name of [...tokens.filter((t) => t.key === 'de').map((t) => t.value), ...(opts.filters?.people ?? [])]) {
    const found = findPeople(name);
    if (found.length) people.push(...found);
    else unknownPeople.push(name);
  }
  for (const t of tokens) {
    if (t.key === 'outil') { const k = toolByName.get(squash(t.value)); if (k) tools.add(k); }
    if (t.key === 'type') { const n = toNature(t.value); if (n) natures.add(n); }
    if (t.key === 'depuis') since = parseSince(t.value) ?? since;
    if (t.key === 'avant') until = parseDate(t.value) ?? until;
  }

  const hasText = stems.length > 0 || phrases.length > 0;
  const hasFilters = tools.size + natures.size + people.length > 0 || Boolean(since || until);
  /** L'élément passe-t-il les filtres (outil, type, période, personne, phrases exactes) ? */
  const allowed = (item: CorpusItem) =>
    !(tools.size && !tools.has(item.kind)) &&
    !(natures.size && !natures.has(item.nature)) &&
    !(since && item.date < since) &&
    !(until && item.date >= until) &&
    !(people.length && !item.turns.some((t) => people.some((p) => speakerIs(t.speaker, p)))) &&
    !phrases.some((p) => !fold(`${item.title ?? ''} ${item.turns.map((t) => t.text).join(' ')}`).includes(fold(p)));
  const scoreOf = (item: CorpusItem): Scored => {
    const all = `${item.title ?? ''} ${item.turns.map((t) => t.text).join(' ')}`;
    const matched = new Set(hits(all, stems));
    const turns = item.turns.flatMap((t, i) => (hits(t.text, stems).length || phrases.some((p) => fold(t.text).includes(fold(p))) ? [i] : []));
    const fresh = Math.max(0, 6 - (NOW.getTime() - item.date.getTime()) / DAY / 5); // bonus des 30 derniers jours
    const score = [...matched].reduce((sum, st) => sum + 10 * (weights.get(st) ?? 1), 0) + hits(item.title ?? '', stems).length * 3 + turns.length + fresh;
    return { item, score, matched, turns };
  };
  let scored: Scored[] = [];
  if (hasText || hasFilters) {
    for (const item of CORPUS) {
      if (!allowed(item)) continue;
      const s = scoreOf(item);
      if (stems.length && !s.matched.size && !phrases.length) continue;
      scored.push(s);
    }
  }
  // Avec du texte : pertinence puis fraîcheur. Filtres seuls : les plus récents d'abord.
  const order = (a: Scored, b: Scored) => (hasText ? b.score - a.score : 0) || b.item.date.getTime() - a.item.date.getTime();
  scored.sort(order);

  // Un sujet connu donne une réponse ; chaque source qu'elle cite (et que les filtres laissent passer) est remontée en
  // page 1, pour qu'aucune affirmation ne perde son renvoi.
  const topic = hasText && scored.length > 0 ? TOPICS.find((t) => t.when(fold(query))) : undefined;
  if (topic) {
    const cited = [...new Set(citedIds(topic.text))]
      .map((id) => scored.find((x) => x.item.id === id) ?? CORPUS.filter((i) => i.id === id && allowed(i)).map(scoreOf)[0])
      .filter((x): x is Scored => Boolean(x));
    const pinned = new Set(cited.map((x) => x.item.id));
    const rest = scored.filter((x) => !pinned.has(x.item.id));
    const room = Math.max(0, PAGE_SIZE - cited.length);
    scored = [...[...rest.slice(0, room), ...cited].sort(order), ...rest.slice(room)];
  }

  const mark = (text: string) => phrases.reduce((t, p) => markPhrase(t, p), markTerms(text, terms));
  const results: SearchResult[] = scored.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(({ item, turns }, i) => {
    // les passages les plus parlants d'abord : plus de mots trouvés, puis plus de texte
    const weight = (ti: number) => hits(item.turns[ti]!.text, stems).length * 1000 + item.turns[ti]!.text.length;
    const shown = (turns.length ? [...turns].sort((a, b) => weight(b) - weight(a)) : [0]).slice(0, 3);
    return {
      n: (page - 1) * PAGE_SIZE + i + 1,
      id: item.id, kind: item.kind, kindLabel: kindLabel(item.kind), nature: item.nature, natureLabel: NATURE_LABELS[item.nature],
      origin: item.origin.slice(0, 60), title: item.title, url: item.url, author: item.author, date: item.date,
      passages: shown.map((ti) => ({ turn: ti, author: item.turns[ti]!.speaker, date: item.turns[ti]!.at, snippet: mark(item.turns[ti]!.text) })),
      // sans mot cherché (filtres seuls), le passage montré est le tour « trouvé » de l'aperçu
      preview: item.turns.map((t, ti) => ({ speaker: t.speaker, at: t.at, text: mark(t.text), matching: (turns.length ? turns : shown).includes(ti) })),
    };
  });

  const total = scored.length;
  const firstPage = scored.slice(0, PAGE_SIZE).map((s) => s.item.id);
  const answer = page === 1 && topic ? citeByRank(topic.text, firstPage) : null;
  return {
    query, page, results, total, pages: Math.ceil(total / PAGE_SIZE), answer,
    answerState: opts.force ?? (answer ? 'ok' : 'not-enough'),
    unknownPeople, unknownFilters: filters.filter((f) => !f.recognized), activeFilters: filters,
    tookMs: 84 + ([...query].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) % 120),
  };
}

// ---------- Réponses de Leon ----------
// Les renvois s'écrivent {id} dans le texte : ils deviennent [n], le rang du résultat en page 1. Une phrase dont
// aucune source n'est en page 1 (écartée par un filtre) est retirée : la réponse n'affirme rien sans renvoi.

const has = (q: string, ...w: string[]) => w.some((x) => q.includes(x));
export const TOPICS: Array<{ id: string; when: (q: string) => boolean; text: string }> = [
  {
    id: 'acme',
    when: (q) => has(q, 'acme', 'zephyr') && has(q, 'renouvel', 'contrat', 'remise', 'zephyr', 'signature', 'avenant'),
    text: 'Le renouvellement est validé sur le principe. Lors du call du 14 octobre, Julie Martin a proposé une remise de 15 % la première année sur le plan Zéphyr, si la signature intervient avant fin octobre {fathom-call-acme}. ACME fait relire la version 3 du contrat par son juridique ; Bob Durand les a relancés le 17 octobre {outlook-relance-acme}, et leur juridique la valide à deux remarques près {outlook-juridique-acme}. Un point bloque encore : l’export SSO demandé par ACME (LIN-42) doit être en production avant la signature {linear-lin-42}.',
  },
  {
    id: 'budget',
    when: (q) => has(q, 'budget', 'plafond', 'depense'),
    text: 'Le plafond de dépenses outils est de 4 000 € par mois pour toute l’équipe ; au-delà, David valide {notion-plafond}. En octobre, on en est à 3 420 €, sous le plafond, et le salon Produit de novembre demandera environ 2 500 € {claap-budget}. La première version du budget 2027 donne 38 % à l’équipe produit et 22 % aux ventes {outlook-budget-2027}.',
  },
  {
    id: 'ovh',
    when: (q) => has(q, 'ovh'),
    text: 'Le contrat OVH arrive à échéance le 30 novembre et se renouvelle seul, sauf résiliation avant le 31 octobre {outlook-ovh}. Thomas Roux garde deux serveurs dédiés et résilie le troisième {notion-infra}, une fois l’indexation migrée {linear-lin-57}.',
  },
  {
    id: 'sauvegardes',
    when: (q) => has(q, 'sauvegard', 'backup', 'restaur'),
    text: 'Oui : la base de production est sauvegardée chaque nuit à 2 h vers Scaleway, avec 30 jours de rétention {github-commit-backup}. Le premier test de restauration a réussi en 11 minutes {github-118}, et le dernier ce matin, pour 4,2 Go {mcp-restore}.',
  },
  {
    id: 'sso',
    when: (q) => has(q, 'sso', 'saml', 'lin-42', 'lin42'),
    text: 'L’export SSO (LIN-42) est bloquant pour la signature du contrat ACME {linear-lin-42}. La PR #131 ajoute l’export des métadonnées SAML ; elle est relue {github-pr-131} et le déploiement est prévu jeudi 22 octobre {claap-pipeline}.',
  },
  {
    id: 'recrutement',
    when: (q) => has(q, 'recrut', 'embauche', 'candidat', 'backend'),
    text: 'Le poste de développeur backend est ouvert depuis septembre, avec trois candidats {notion-recrutement}. Camille a reçu un avis favorable après son entretien du 19 octobre {granola-entretien}, et une proposition d’embauche lui a été envoyée le 20 octobre, pour une arrivée le 1er décembre {outlook-offre-camille}.',
  },
];

const citedIds = (text: string): string[] => [...text.matchAll(/\{([\w-]+)\}/g)].map((m) => m[1]!);

function citeByRank(text: string, ids: string[]): string | null {
  const kept = text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => {
      const refs = citedIds(sentence);
      return !refs.length || refs.some((id) => ids.includes(id));
    })
    .map((sentence) => sentence.replace(/ ?\{([\w-]+)\}/g, (_, id: string) => (ids.includes(id) ? ` [${ids.indexOf(id) + 1}]` : '')));
  // une phrase sans renvoi ne tient pas seule (« Oui : … » sans la suite) : pas de réponse
  return kept.some((s) => /\[\d+\]/.test(s)) ? nb(kept.join(' ')) : null;
}

// ---------- Contenus de l'accueil et des menus ----------

export const SEARCH_EXAMPLES = [
  { q: 'outil:github type:ticket', hint: 'Les tickets GitHub, les plus récents d’abord' },
  { q: 'type:réunion depuis:7j', hint: 'Les réunions de la semaine' },
  { q: '"renouvellement du contrat"', hint: 'Les mots exacts d’une phrase' },
  { q: 'budget depuis:3m', hint: 'Un sujet, sur les trois derniers mois' },
];

export const SYNTAX_HELP = [
  { code: 'de:julie', text: 'ce qu’une personne a écrit (son nom ou son e-mail)' },
  { code: 'outil:github', text: 'un seul outil' },
  { code: 'type:réunion', text: 'une sorte de source : ticket, page, mail, fichier, conversation…' },
  { code: 'depuis:7j', text: 'les 7 derniers jours (j), semaines (s) ou mois (m)' },
  { code: 'avant:2026-10-01', text: 'avant une date' },
  { code: '"phrase exacte"', text: 'les mots tels quels, dans cet ordre' },
];

/** Menu « Outil » : toutes les origines, par libellé (valeur = identifiant à écrire dans outil:). */
export const TOOL_OPTIONS = [...PROVIDERS.map((p) => ({ value: p.id as string, label: p.label })), ...CAPTURE_CHANNELS.map((c) => ({ value: c.id as string, label: c.label }))]
  .sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }));
/** Menu « Type » (valeur = nature à écrire dans type:). */
export const NATURE_OPTIONS = NATURES.map((n) => ({ value: n as string, label: NATURE_LABELS[n] }));
/** Menu « Période » (valeur à écrire dans depuis:). */
export const PERIOD_OPTIONS = [
  { value: '7j', label: '7 derniers jours' },
  { value: '30j', label: '30 derniers jours' },
  { value: '3m', label: '3 derniers mois' },
  { value: '12m', label: '12 derniers mois' },
];

/** Recherches récentes (palette ⌘K). */
export const RECENT_SEARCHES = [
  { q: 'où en est le renouvellement du contrat ACME ?', at: minutesAgo(120) },
  { q: 'outil:github type:ticket', at: minutesAgo(60 * 24) },
  { q: 'type:réunion depuis:7j', at: minutesAgo(60 * 24 * 3) },
];

/** « 3 sources », « 1 source », « Environ 1 234 sources » au-delà de 10. */
export function countLabel(total: number): string {
  if (total > 10) return `Environ ${formatNumber(total)} sources`;
  return `${total} ${total > 1 ? 'sources' : 'source'}`;
}

/** Retire les marqueurs de surlignage (texte brut d'un extrait). */
export const plain = (s: string): string => s.replaceAll(HL_START, '').replaceAll(HL_END, '');


// Contrôle : sur les requêtes de démonstration (sans filtre), chaque renvoi de la réponse est résolu en page 1.
console.assert(
  ['où en est le renouvellement du contrat ACME ?', 'budget', 'ovh', 'sauvegardes', 'sso', 'recrutement', 'budget depuis:3m'].every((q) => {
    const r = search(q);
    const topic = TOPICS.find((t) => t.when(fold(q)))!;
    const refs = r.answer?.match(/\[\d+\]/g) ?? [];
    return refs.length === citedIds(topic.text).length && refs.every((m) => Number(m.slice(1, -1)) <= r.results.length);
  }) && search('xyzzy').total === 0,
  'search.ts : une réponse de démonstration a perdu un renvoi',
);
