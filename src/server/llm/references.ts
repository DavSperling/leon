// Les renvois [n] qu'écrit le modèle, filtrés au fil du flux : seuls les numéros qu'on lui a fournis restent, un
// par crochet ; un renvoi qui n'en garde aucun disparaît avec l'espace qui le précède. Partagé par la réponse en
// tête (numéros fixés avant l'appel) et la discussion (numéros donnés au fil des outils : `allowed` est lu au
// moment où chaque renvoi passe). Module pur.

// Un renvoi « [2] » ou une liste « [1, 3] ».
const REFERENCE = /( ?)\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})*)\]/g;
// Le début d'un renvoi en fin de morceau : on le garde jusqu'au morceau suivant pour le lire en entier.
const PARTIAL_REFERENCE = / ?\[[\d,;\s]{0,40}$/;

export function createReferenceFilter(allowed: { has(n: number): boolean }): {
  push(delta: string): string;
  flush(): string;
} {
  let pending = '';
  const clean = (text: string) =>
    text.replace(REFERENCE, (_match, space: string, list: string) => {
      const kept = [...new Set(list.split(/[,;]/).map((n) => Number(n.trim())))].filter((n) =>
        allowed.has(n),
      );
      return kept.length === 0 ? '' : `${space}${kept.map((n) => `[${n}]`).join('')}`;
    });
  return {
    push(delta) {
      const text = pending + delta;
      const partial = PARTIAL_REFERENCE.exec(text);
      pending = partial ? partial[0] : '';
      return clean(partial ? text.slice(0, partial.index) : text);
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
  const numbers = [...text.matchAll(/\[(\d{1,3})\]/g)].map((match) => Number(match[1]));
  return [...new Set(numbers)].filter((n) => n >= 1).sort((a, b) => a - b);
}
