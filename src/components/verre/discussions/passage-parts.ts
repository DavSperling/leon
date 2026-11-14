import { highlightTerms } from '@/components/search/highlighted-text';
import { markdownPlain } from '@/lib/markdown';
import { sharedRuns } from '@/lib/source-marks';

// Le tour d'une source dans le panneau de l'original, en morceaux marqués ou non. Module pur (testé à part).

// Un passage introuvable dans son tour (texte retouché, coupé) : un tour court est marqué entier, un long ne l'est pas.
const WHOLE_TURN_MAX = 400;

// Deux suites d'une même phrase restent marquées ensemble si moins de 120 caractères les séparent dans la source.
const NEAR = 120;

// Un long tour cité en entier, depuis un résultat de recherche : on marque sa première phrase (200 caractères au plus).
const OPENING_MAX = 200;

/** `anchor` : le début du passage cité quand rien n'y est marqué ; le panneau l'amène en vue. */
export type Part = { text: string; hit: boolean; anchor?: true };

/** La première phrase d'un texte, coupée à un mot si elle est trop longue : sa fin, en position dans le texte. */
function openingEnd(text: string): number {
  const stop = /[.!?…](?=\s)|\n/.exec(text);
  const end = stop ? stop.index + (stop[0] === '\n' ? 0 : 1) : text.length;
  if (end <= OPENING_MAX) return end;
  const cut = text.lastIndexOf(' ', OPENING_MAX);
  return cut > 0 ? cut : OPENING_MAX;
}

/**
 * Le tour du passage, en morceaux, sur le texte tel qu'il s'affiche (sans les marques du Markdown). Ouvert depuis une
 * réponse ou une ligne du point (`used`, même vide) : seuls les mots qu'elle a pris au passage sont marqués, comme dans
 * la réponse (remarque 10 du fondateur) ; aucun mot repris, aucune marque. Ouvert depuis un résultat de recherche (sans
 * `used`) : le passage cité, ou les mots cherchés. Un long tour cité en entier n'est jamais surligné d'un bloc.
 */
export function passageParts(
  raw: string,
  rawPassage: string | undefined,
  terms: string[],
  used?: string[],
): Part[] {
  const text = markdownPlain(raw);
  const wanted = rawPassage === undefined ? '' : markdownPlain(rawPassage).trim();
  // le passage garde ses premiers mots tels quels ; il peut être coupé (2 000 caractères) : on repère son début
  const start = wanted === '' ? -1 : text.indexOf(wanted.slice(0, 160));
  const end = Math.min(text.length, start + wanted.length);
  if (used !== undefined) {
    const from = start === -1 ? 0 : start;
    const region = text.slice(from, start === -1 ? text.length : end);
    // par phrase : sa meilleure suite, et la seconde seulement si elle en est voisine (un nom repris plus loin dans le
    // tour, seul, serait une marque de trop)
    const runs = used
      .flatMap((sentence) => {
        const found = sharedRuns(region, sentence);
        if (found.length === 0) return [];
        const best = found.reduce((a, b) => (b.score > a.score ? b : a));
        return found.filter(
          (run) => run === best || Math.max(run.start - best.end, best.start - run.end) <= NEAR,
        );
      })
      .sort((a, b) => a.start - b.start);
    const parts: Part[] = [];
    let at = 0;
    for (const run of runs) {
      const s = Math.max(at, from + run.start);
      const e = from + run.end;
      if (e <= s) continue;
      if (s > at) parts.push({ text: text.slice(at, s), hit: false });
      parts.push({ text: text.slice(s, e), hit: true });
      at = e;
    }
    if (at > 0) return at < text.length ? [...parts, { text: text.slice(at), hit: false }] : parts;
    // rien de repris : rien de marqué, mais le début du passage reste repéré pour l'amener en vue
    if (start <= 0) return [{ text, hit: false }];
    return [
      { text: text.slice(0, start), hit: false },
      { text: text.slice(start), hit: false, anchor: true },
    ];
  }
  if (wanted !== '' && start !== -1) {
    // un long tour cité en entier : pas un bloc de couleur, mais sa première phrase, qui dit où il commence
    const whole = start === 0 && end === text.length && text.length > WHOLE_TURN_MAX;
    const stop = whole ? openingEnd(text) : end;
    return [
      { text: text.slice(0, start), hit: false },
      { text: text.slice(start, stop), hit: true },
      { text: text.slice(stop), hit: false },
    ].filter((part) => part.text !== '');
  }
  if (terms.length > 0) return highlightTerms(text, terms);
  if (rawPassage !== undefined && text.length <= WHOLE_TURN_MAX) return [{ text, hit: true }];
  return [{ text, hit: false }];
}

/**
 * Un tour, en blocs : un paragraphe, une liste, un tableau. Le texte d'une source garde son Markdown (une page Notion
 * arrive avec ses « | Ville | La Roche-sur-Yon | ») : montré tel quel, il se lit comme cassé.
 */
export type PassageBlock =
  | { type: 'p'; parts: Part[] }
  | { type: 'list'; ordered: boolean; items: Part[][] }
  | { type: 'table'; head: Part[][] | null; rows: Part[][][] };

const TABLE_ROW = /^\s*\|.*\|\s*$/;
// la ligne de tirets sous l'en-tête : « |---|:--:| »
const TABLE_RULE = /^\s*\|(?:\s*:?-{2,}:?\s*\|)+\s*$/;
const LIST_ITEM = /^\s*(?:([-*+•])|\d{1,3}[.)])\s+/;

const textOf = (line: Part[]) => line.map((part) => part.text).join('');

/** Les morceaux coupés en lignes : chaque ligne garde ses marques. */
function partLines(parts: Part[]): Part[][] {
  const lines: Part[][] = [[]];
  for (const part of parts) {
    part.text.split('\n').forEach((piece, i) => {
      if (i > 0) lines.push([]);
      if (piece !== '') (lines.at(-1) as Part[]).push({ ...part, text: piece });
    });
  }
  return lines;
}

/** La ligne de `from` à `to` (positions dans son texte), sans les blancs des bords. */
function slice(line: Part[], from: number, to: number): Part[] {
  const text = textOf(line).slice(from, to);
  const start = from + (text.length - text.trimStart().length);
  const end = to - (text.length - text.trimEnd().length);
  const out: Part[] = [];
  let at = 0;
  for (const part of line) {
    const piece = part.text.slice(Math.max(0, start - at), Math.max(0, end - at));
    if (piece !== '') out.push({ ...part, text: piece });
    at += part.text.length;
  }
  return out;
}

/** Les cases d'une ligne de tableau, sans ses barres. */
function cells(line: Part[]): Part[][] {
  const text = textOf(line);
  const bars = [...text.matchAll(/\|/g)].map((m) => m.index);
  return bars.slice(0, -1).map((bar, i) => slice(line, bar + 1, bars[i + 1] as number));
}

const blankCells = (row: Part[][]) => row.every((cell) => textOf(cell) === '');

export function passageBlocks(parts: Part[]): PassageBlock[] {
  const out: PassageBlock[] = [];
  let para: Part[] = [];
  const flush = () => {
    if (para.length > 0) out.push({ type: 'p', parts: para });
    para = [];
  };
  const lines = partLines(parts);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] as Part[];
    const text = textOf(line);
    const item = LIST_ITEM.exec(text);
    if (text.trim() === '') {
      flush();
    } else if (TABLE_ROW.test(text)) {
      flush();
      const rows: Part[][][] = [];
      let head: Part[][] | null = null;
      for (; i < lines.length && TABLE_ROW.test(textOf(lines[i] as Part[])); i += 1) {
        if (!TABLE_RULE.test(textOf(lines[i] as Part[]))) rows.push(cells(lines[i] as Part[]));
        else if (rows.length === 1 && head === null) head = rows.pop() as Part[][];
      }
      i -= 1;
      // un en-tête vide (« | | | », Notion) ne dit rien : la première colonne nomme alors chaque ligne
      if (head && blankCells(head)) head = null;
      const kept = rows.filter((row) => !blankCells(row));
      if (head || kept.length > 0) out.push({ type: 'table', head, rows: kept });
    } else if (item && (item[1] !== undefined || para.length === 0)) {
      // dans un paragraphe, « 12. » en début de ligne reste du texte (comme dans une réponse : lib/markdown.ts)
      flush();
      const ordered = item[1] === undefined;
      const items: Part[][] = [];
      for (; i < lines.length; i += 1) {
        const next = LIST_ITEM.exec(textOf(lines[i] as Part[]));
        if (!next || (next[1] === undefined) !== ordered) break;
        items.push(slice(lines[i] as Part[], next[0].length, textOf(lines[i] as Part[]).length));
      }
      i -= 1;
      out.push({ type: 'list', ordered, items });
    } else {
      if (para.length > 0) para.push({ text: '\n', hit: false });
      para.push(...line);
    }
  }
  flush();
  return out;
}
