// Le texte de la réponse en tête, découpé pour l'affichage : du texte et des renvois [n] aux résultats de la
// première page (n = rang du résultat, 1 pour le premier). Le texte n'est jamais interprété comme du HTML. Module
// pur, que le navigateur importe : rien de `@/server`.

export type AnswerSegment = { text: string } | { ref: number };

const REFERENCE = /\[(\d{1,3})\]/g;

// Un renvoi à un résultat que la page n'affiche pas est écarté (le serveur n'en laisse déjà passer aucun).
export function answerSegments(text: string, resultCount: number): AnswerSegment[] {
  const segments: AnswerSegment[] = [];
  const pushText = (piece: string) => {
    if (piece === '') return;
    const last = segments.at(-1);
    if (last && 'text' in last) last.text += piece;
    else segments.push({ text: piece });
  };
  let from = 0;
  for (const match of text.matchAll(REFERENCE)) {
    pushText(text.slice(from, match.index));
    const n = Number(match[1]);
    if (n >= 1 && n <= resultCount) segments.push({ ref: n });
    from = match.index + match[0].length;
  }
  pushText(text.slice(from));
  return segments;
}

// L'ancre d'un résultat dans la page : un renvoi [n] de la réponse y mène.
export function resultAnchorId(sourceId: string): string {
  return `resultat-${sourceId}`;
}
