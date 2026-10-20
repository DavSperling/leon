// Les renvois [n] de Leon dans un texte. Un renvoi, ou une suite de renvois « [1][3] », n'est jamais collé à une
// lettre, un chiffre, « _ », « ] » ou « ) » : `argv[0]`, `items[1][2]` ou `f(x)[3]` sont du code, qui reste du
// texte. Module pur, partagé par le serveur (filtre du flux) et le navigateur (affichage) : rien de `@/server`.

const GLUED = /[\p{L}\p{N}_\])]$/u;

// `previous` : le texte juste avant le crochet (deux caractères suffisent, pour une lettre hors du plan de base).
export function gluedReference(previous: string): boolean {
  return GLUED.test(previous);
}

export type ReferenceSegment = { text: string } | { ref: number };

const CHAIN = /(?:\[\d{1,3}\])+/g;
const ONE = /\[(\d{1,3})\]/g;

// Le texte découpé en morceaux de texte et en renvois (un numéro par crochet) ; un renvoi que `keep` refuse est
// écarté. Le texte n'est jamais interprété comme du HTML.
export function referenceSegments(text: string, keep: (n: number) => boolean): ReferenceSegment[] {
  const segments: ReferenceSegment[] = [];
  const pushText = (piece: string) => {
    if (piece === '') return;
    const last = segments.at(-1);
    if (last && 'text' in last) last.text += piece;
    else segments.push({ text: piece });
  };
  let from = 0;
  for (const match of text.matchAll(CHAIN)) {
    if (gluedReference(text.slice(Math.max(0, match.index - 2), match.index))) continue;
    pushText(text.slice(from, match.index));
    for (const [, digits] of match[0].matchAll(ONE)) {
      const n = Number(digits);
      if (keep(n)) segments.push({ ref: n });
    }
    from = match.index + match[0].length;
  }
  pushText(text.slice(from));
  return segments;
}
