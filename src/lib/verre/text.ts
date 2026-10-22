// Surlignages (marqueurs posés par Postgres) et renvois « [n] » : ceux de src/lib (déjà testés), sous les noms de la
// maquette. markTerms et markPhrase marquent côté navigateur (recherche dans les discussions de la maquette).
import { HIGHLIGHT_END as HL_END, HIGHLIGHT_START as HL_START } from '@/lib/highlight';

export { splitHighlights } from '@/lib/highlight';
export { type ReferenceSegment as RefSegment, referenceSegments } from '@/lib/references';

export { HL_END, HL_START };

export type HighlightPart = { text: string; hit: boolean };

/** Sans casse ni accent, espaces insécables (nb()) ramenées à l'espace : « Réunion » et « reunion » se confondent. */
export const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .toLowerCase();

/** Entoure de marqueurs les mots de `text` qui commencent comme un des `terms` (racine grossière, sans accent). */
export function markTerms(text: string, terms: readonly string[]): string {
  const stems = terms
    .map((t) =>
      fold(t)
        .replace(/(s|x|es)$/, '')
        .slice(0, 7),
    )
    .filter((t) => t.length >= 2);
  if (stems.length === 0) return text;
  return text.replace(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu, (word) =>
    stems.some((s) => fold(word).startsWith(s)) ? `${HL_START}${word}${HL_END}` : word,
  );
}

/** Marque une phrase exacte (sans casse ni accent), là où elle apparaît. */
export function markPhrase(text: string, phrase: string): string {
  const f = fold(text);
  const p = fold(phrase);
  const at = f.indexOf(p);
  if (!p || at < 0) return text;
  return `${text.slice(0, at)}${HL_START}${text.slice(at, at + p.length)}${HL_END}${markPhrase(text.slice(at + p.length), phrase)}`;
}
