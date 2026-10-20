// Les renvois [n] qu'écrit le modèle, filtrés au fil du flux : seuls les numéros qu'on lui a fournis restent, un
// par crochet ; un renvoi qui n'en garde aucun disparaît avec l'espace qui le précède. Partagé par la réponse en
// tête (numéros fixés avant l'appel) et la discussion (numéros donnés au fil des outils : `allowed` est lu au
// moment où chaque renvoi passe). Un crochet collé à un mot, à « ] » ou à « ) » (`argv[0]`, `items[1]`) est du
// code : il reste tel quel (@/lib/references). Module pur.

import { gluedReference, referenceSegments } from '@/lib/references';

// Un renvoi « [2] », une liste « [1, 3] », ou une suite « [1][3] ».
const REFERENCE = /( ?)((?:\[\d{1,3}(?:\s*[,;]\s*\d{1,3})*\])+)/g;
// Les renvois en fin de morceau, entiers ou commencés : on les garde jusqu'au morceau suivant pour lire la suite
// en entier.
const PARTIAL_REFERENCE = / ?(?:\[[\d,;\s]{0,40}\]?)+$/;

export function createReferenceFilter(allowed: { has(n: number): boolean }): {
  push(delta: string): string;
  flush(): string;
} {
  let pending = '';
  // Les derniers caractères déjà rendus : ils disent si un crochet en tête de morceau est collé à un mot.
  let before = '';
  const clean = (text: string) =>
    text.replace(REFERENCE, (match, space: string, chain: string, offset: number) => {
      const previous = offset === 0 ? before : text.slice(Math.max(0, offset - 2), offset);
      if (space === '' && gluedReference(previous)) return match;
      const numbers = [...chain.matchAll(/\d{1,3}/g)].map((n) => Number(n[0]));
      const kept = [...new Set(numbers)].filter((n) => allowed.has(n));
      return kept.length === 0 ? '' : `${space}${kept.map((n) => `[${n}]`).join('')}`;
    });
  return {
    push(delta) {
      const text = pending + delta;
      const partial = PARTIAL_REFERENCE.exec(text);
      pending = partial ? partial[0] : '';
      const ready = partial ? text.slice(0, partial.index) : text;
      const out = clean(ready);
      if (ready !== '') before = ready.slice(-2);
      return out;
    },
    flush() {
      const rest = clean(pending);
      pending = '';
      return rest;
    },
  };
}

// Les numéros cités dans un texte déjà filtré (un par crochet), une fois chacun, dans l'ordre croissant.
export function referencedNumbers(text: string): number[] {
  const numbers = referenceSegments(text, (n) => n >= 1).flatMap((segment) =>
    'ref' in segment ? [segment.ref] : [],
  );
  return [...new Set(numbers)].sort((a, b) => a - b);
}
