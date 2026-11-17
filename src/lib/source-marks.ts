// Le surligneur d'une réponse (remarque 10 du fondateur) : dans une phrase citée, seuls les mots qui viennent de la
// source sont marqués, dans la couleur de la source. Pour chaque phrase suivie d'un renvoi « [n] », on cherche les plus
// longues suites de mots qu'elle partage avec le passage cité (sans casse ni accent, les petits mots ne comptent pas) ;
// un nombre, une date ou un nom propre compte seul. Rien de partagé : rien de marqué, le numéro coloré reste.
// Module pur, partagé par la discussion et la réponse de la recherche : le texte n'est jamais lu comme du HTML.

import { gluedReference } from './references';

// Marqueurs de la zone privée d'Unicode (ceux de highlight.ts sont U+E000 et U+E001) : l'ouverture porte le numéro de
// la source (U+E100 + n), la fermeture est commune. Ils ne sont posés qu'à l'affichage, jamais stockés.
const OPEN_BASE = 0xe100;
export const MARK_END = '';
const openMark = (n: number) => String.fromCharCode(OPEN_BASE + n);

// Au plus deux suites marquées par phrase : une longue réponse se lit à l'encre, avec quelques marques.
const RUNS_PER_SENTENCE = 2;

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const SMALL = new Set(
  (
    'a an the of to in on at by for from with and or but nor is are was were be been being it its this that these those ' +
    'as into than then so not no do does did has have had will would can could should may might must our your their his ' +
    'her my we you they he she i me us them which who whom whose what when where why how about over under after before ' +
    'since until also just only more most very there here all any some each per via if ' +
    'le la les l un une des du de d et ou mais donc ni car est sont etait etaient ete etre ai as ont avait avaient il ' +
    'elle ils elles on nous vous je tu me te se ce cet cette ces ca cela ceci qui que quoi dont au aux en dans par pour ' +
    'sur sous avec sans chez vers entre pas ne n plus moins tres aussi tout tous toute toutes son sa ses leur leurs mon ' +
    'ma mes ton ta tes notre nos votre vos y s c j m t qu lui eux si comme'
  )
    .split(' ')
    .map(fold),
);

// Un mot : lettres et chiffres, avec « 1,842 », « 2026-10-12 », « 10:30 » ou « 12.5 » d'un seul tenant.
const WORD = /[\p{L}\p{N}]+(?:[.,:/-]\p{N}+)*/gu;

type Word = {
  start: number;
  end: number;
  key: string;
  small: boolean;
  strong: boolean;
  // une majuscule ailleurs qu'en tête de phrase : un nom propre
  capital: boolean;
};

function words(text: string): Word[] {
  const out: Word[] = [];
  for (const match of text.matchAll(WORD)) {
    const raw = match[0];
    const key = fold(raw);
    const digit = /\p{N}/u.test(raw);
    const head = /(^|[.!?:;\n"«“]\s*)$/u.test(
      text.slice(Math.max(0, match.index - 3), match.index),
    );
    const capital = /^\p{Lu}/u.test(raw) && !head;
    const acronym = raw.length >= 2 && /^\p{Lu}+$/u.test(raw);
    out.push({
      start: match.index,
      end: match.index + raw.length,
      key,
      small: !digit && (SMALL.has(key) || key.length === 1),
      // Compte seul : un nombre ou une date, un sigle (ACME), un nom propre (V2, Karim).
      strong: digit || capital || acronym,
      capital,
    });
  }
  return out;
}

export type SharedRun = { start: number; end: number; score: number };

/**
 * Les plus longues suites de mots que `sentence` partage avec `passage` (au plus deux, sans chevauchement), en
 * positions dans `sentence`. Une suite commence et finit par un mot qui compte ; elle en a deux au moins, ou un seul
 * s'il est un nombre, une date ou un nom propre.
 */
export function sharedRuns(
  sentence: string,
  passage: string,
  max = RUNS_PER_SENTENCE,
): SharedRun[] {
  const p = words(passage);
  // Un nom en tête de phrase (« Sophie a déplacé… ») est un nom propre si la source l'écrit avec sa majuscule.
  const names = new Set(p.filter((w) => w.capital).map((w) => w.key));
  const s = words(sentence).map((w) => (names.has(w.key) ? { ...w, strong: true } : w));
  if (s.length === 0 || p.length === 0) return [];
  const at = new Map<string, number[]>();
  p.forEach((word, j) => {
    const list = at.get(word.key);
    if (list) list.push(j);
    else at.set(word.key, [j]);
  });
  // La plus longue suite commune qui finit sur chaque mot de la phrase (programmation dynamique sur les mots).
  const candidates: SharedRun[] = [];
  let previous = new Map<number, number>();
  s.forEach((word, i) => {
    const current = new Map<number, number>();
    let longest = 0;
    for (const j of at.get(word.key) ?? []) {
      const length = (previous.get(j - 1) ?? 0) + 1;
      current.set(j, length);
      longest = Math.max(longest, length);
    }
    previous = current;
    if (longest === 0) return;
    let from = i - longest + 1;
    let to = i;
    while (from <= to && s[from]?.small) from++;
    while (to >= from && s[to]?.small) to--;
    if (from > to) return;
    const run = s.slice(from, to + 1).filter((w) => !w.small);
    if (run.length < 2 && !run[0]?.strong) return;
    const start = s[from]?.start ?? 0;
    const end = s[to]?.end ?? 0;
    // `argv[0]` : une marque fermée juste avant un crochet en ferait un renvoi.
    if (sentence[end] === '[') return;
    candidates.push({ start, end, score: run.length * 1000 + (end - start) });
  });
  candidates.sort((a, b) => b.score - a.score);
  const chosen: SharedRun[] = [];
  for (const run of candidates) {
    if (chosen.length >= max) break;
    if (chosen.some((c) => run.start < c.end && c.start < run.end)) continue;
    chosen.push(run);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

const CHAIN = /(?:\[\d{1,3}\])+/g;
const ONE = /\[(\d{1,3})\]/g;
// La fin d'une phrase : un point, un « ! », un « ? » ou un « ; » suivi d'une espace, ou un retour à la ligne.
const SENTENCE_END = /[.!?…;]["»”’)]*\s+|\n/g;

/** Chaque suite de renvois « [n] » d'un texte : la phrase qui la précède (et où elle commence) et ses numéros. */
function* citedSentences(
  text: string,
): Generator<{ start: number; sentence: string; numbers: number[] }> {
  let from = 0;
  for (const match of text.matchAll(CHAIN)) {
    if (gluedReference(text.slice(Math.max(0, match.index - 2), match.index))) continue;
    const before = text.slice(from, match.index);
    const trimmed = before.trimEnd().length;
    let cut = 0;
    for (const end of before.matchAll(SENTENCE_END)) {
      const after = end.index + end[0].length;
      if (after < trimmed) cut = after;
    }
    yield {
      start: from + cut,
      sentence: text.slice(from + cut, match.index),
      numbers: [...new Set([...match[0].matchAll(ONE)].map((m) => Number(m[1])))],
    };
    from = match.index + match[0].length;
  }
}

/** Les phrases d'une réponse qui renvoient à la source `n` : le panneau de la source y marque les mêmes mots. */
export const citingSentences = (text: string, n: number): string[] =>
  [...citedSentences(text)].filter((c) => c.numbers.includes(n)).map((c) => c.sentence.trim());

/**
 * Le texte d'un bloc (paragraphe, élément de liste) avec les marques des mots venus de la source : pour chaque suite de
 * renvois, la phrase qui la précède est comparée au passage de chaque numéro (`passageOf`), et ses deux meilleures
 * suites sont entourées des marqueurs de leur numéro. Une marque ne traverse jamais `*`, `_` ou `` ` `` (la mise en
 * forme du Markdown la couperait). Sans passage connu, le texte revient tel quel.
 */
export function markCited(
  text: string,
  passageOf: (n: number) => string | undefined,
  keep: (n: number) => boolean = () => true,
): string {
  const ranges: Array<{ start: number; end: number; n: number }> = [];
  for (const cited of citedSentences(text)) {
    const { start: sentenceStart, sentence } = cited;
    const numbers = cited.numbers.filter(keep);
    const found: Array<SharedRun & { n: number }> = [];
    for (const n of numbers) {
      const passage = passageOf(n);
      if (passage) for (const run of sharedRuns(sentence, passage)) found.push({ ...run, n });
    }
    found.sort((a, b) => b.score - a.score);
    const chosen: typeof found = [];
    for (const run of found) {
      if (chosen.length >= RUNS_PER_SENTENCE) break;
      if (chosen.some((c) => run.start < c.end && c.start < run.end)) continue;
      chosen.push(run);
    }
    // deux suites de la même source que seule une espace sépare se lisent d'un seul trait, sans couture
    const joined: typeof chosen = [];
    for (const run of chosen.sort((x, y) => x.start - y.start)) {
      const last = joined.at(-1);
      if (last && last.n === run.n && /^\s*$/.test(sentence.slice(last.end, run.start)))
        last.end = run.end;
      else joined.push({ ...run });
    }
    for (const run of joined) {
      // coupée sur la mise en forme : chaque morceau reste dans un seul morceau de texte rendu
      let piece = sentenceStart + run.start;
      const end = sentenceStart + run.end;
      for (let i = piece; i <= end; i++) {
        if (i === end || /[*_`]/.test(text[i] ?? '')) {
          // chaque morceau commence et finit sur un mot qui compte (« effet le **05/11** » : « effet », « 05/11 »)
          const kept = words(text.slice(piece, i)).filter((w) => !w.small);
          const first = kept[0];
          const last = kept.at(-1);
          if (first && last)
            ranges.push({ start: piece + first.start, end: piece + last.end, n: run.n });
          piece = i + 1;
        }
      }
    }
  }
  if (ranges.length === 0) return text;
  let out = text;
  for (const range of ranges.sort((a, b) => b.start - a.start)) {
    out = `${out.slice(0, range.start)}${openMark(range.n)}${out.slice(range.start, range.end)}${MARK_END}${out.slice(range.end)}`;
  }
  return out;
}

export type MarkedPart = { text: string; n: number | null };

const MARKER = /[-]/;

/**
 * Un texte marqué par markCited, en morceaux : `n` est le numéro de la source d'un morceau marqué. `open` : le numéro
 * d'une marque ouverte dans un morceau précédent (rendu d'une suite de morceaux) ; la fonction rend celui qui reste
 * ouvert à la fin.
 */
export function splitMarks(
  text: string,
  open: number | null = null,
): { parts: MarkedPart[]; open: number | null } {
  const parts: MarkedPart[] = [];
  let current = open;
  let buffer = '';
  const flush = () => {
    if (buffer !== '') parts.push({ text: buffer, n: current });
    buffer = '';
  };
  for (const char of text) {
    if (!MARKER.test(char)) {
      buffer += char;
      continue;
    }
    flush();
    current = char === MARK_END ? null : char.charCodeAt(0) - OPEN_BASE;
  }
  flush();
  return { parts, open: current };
}

/** Le texte sans aucune marque du surligneur (le code, ce qu'on copie). */
export function stripMarks(text: string): string {
  return text.replace(/[-]/g, '');
}
