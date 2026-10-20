// Le texte de la réponse en tête, découpé pour l'affichage : du texte et des renvois [n] aux résultats de la
// première page (n = rang du résultat, 1 pour le premier). Le texte n'est jamais interprété comme du HTML. Module
// pur, que le navigateur importe : rien de `@/server`.

import { type ReferenceSegment, referenceSegments } from '@/lib/references';

export type AnswerSegment = ReferenceSegment;

// Un renvoi à un résultat que la page n'affiche pas est écarté (le serveur n'en laisse déjà passer aucun).
export function answerSegments(text: string, resultCount: number): AnswerSegment[] {
  return referenceSegments(text, (n) => n >= 1 && n <= resultCount);
}

// L'ancre d'un résultat dans la page : un renvoi [n] de la réponse y mène.
export function resultAnchorId(sourceId: string): string {
  return `resultat-${sourceId}`;
}
