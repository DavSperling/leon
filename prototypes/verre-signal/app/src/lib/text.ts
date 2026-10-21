// Surlignages (U+E000 … U+E001 autour des mots trouvés, comme Postgres dans le vrai Leon) et renvois « [n] ».
export const HL_START = '';
export const HL_END = '';

export type HighlightPart = { text: string; hit: boolean };

/** Découpe un extrait marqué en morceaux surlignés ou non. Le texte n'est jamais lu comme du HTML. */
export function splitHighlights(snippet: string): HighlightPart[] {
  const parts: HighlightPart[] = [];
  const re = new RegExp(`${HL_START}([^${HL_START}${HL_END}]*)${HL_END}`, 'g');
  let from = 0;
  for (const m of snippet.matchAll(re)) {
    if (m.index > from) parts.push({ text: snippet.slice(from, m.index), hit: false });
    if (m[1]) parts.push({ text: m[1], hit: true });
    from = m.index + m[0].length;
  }
  if (from < snippet.length) parts.push({ text: snippet.slice(from), hit: false });
  return parts;
}

/** Sans casse ni accent, espaces insécables (nb()) ramenées à l'espace : « Réunion » et « reunion » se confondent. */
export const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[\u00a0\u202f]/g, ' ').toLowerCase();

/** Entoure de marqueurs les mots de `text` qui commencent comme un des `terms` (racine grossière, sans accent). */
export function markTerms(text: string, terms: readonly string[]): string {
  const stems = terms.map((t) => fold(t).replace(/(s|x|es)$/, '').slice(0, 7)).filter((t) => t.length >= 2);
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

export type RefSegment = { text: string } | { ref: number };

/**
 * Découpe un texte en morceaux et renvois « [n] » (ou « [1][3] »). Un crochet collé à une lettre, un chiffre,
 * « _ », « ] » ou « ) » est du code (`argv[0]`) et reste du texte. `keep` écarte un renvoi inconnu.
 */
export function referenceSegments(text: string, keep: (n: number) => boolean = () => true): RefSegment[] {
  const out: RefSegment[] = [];
  const push = (t: string) => {
    if (!t) return;
    const last = out.at(-1);
    if (last && 'text' in last) last.text += t;
    else out.push({ text: t });
  };
  let from = 0;
  for (const m of text.matchAll(/(?:\[\d{1,3}\])+/g)) {
    if (/[\p{L}\p{N}_\])]$/u.test(text.slice(Math.max(0, m.index - 2), m.index))) continue;
    push(text.slice(from, m.index));
    for (const [, d] of m[0].matchAll(/\[(\d{1,3})\]/g)) if (keep(Number(d))) out.push({ ref: Number(d) });
    from = m.index + m[0].length;
  }
  push(text.slice(from));
  return out;
}

console.assert(
  JSON.stringify(referenceSegments('Oui [1][3]. argv[0]')) === '[{"text":"Oui "},{"ref":1},{"ref":3},{"text":". argv[0]"}]' &&
    splitHighlights(markTerms('Le contrat ACME', ['contrats'])).filter((p) => p.hit).map((p) => p.text).join() === 'contrat',
  'text.ts : renvois ou surlignage incorrects',
);
