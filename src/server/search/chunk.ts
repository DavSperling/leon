// Découpe d'un tour en passages pour la recherche (C5). Pur : ni base, ni réseau.
// Les positions `start` et `end` désignent le texte source du tour ; le texte du passage en retire les
// marqueurs de surlignage (C6), qui ne doivent jamais revenir comme du contenu.
// Les positions sont en unités UTF-16, celles de `text.slice(start, end)` : un émoji y vaut 2, alors que
// `length`, `substr` et `substring` de Postgres le comptent pour 1. Elles ne se lisent qu'en TypeScript.
// Un texte fait seulement d'espaces ou de marqueurs ne donne aucun passage : un tour blanc n'est pas
// cherchable, et son indexation se termine quand même. Tout autre texte donne au moins un passage.

import { stripHighlightMarks } from '@/lib/highlight';

const PASSAGE_TARGET = 1200;
const PASSAGE_MAX = 1600;
// Une coupe ne tombe jamais avant : chaque passage, sauf le dernier, a au moins cette taille.
const PASSAGE_MIN = 1000;
const PASSAGE_OVERLAP = 150;

export type Chunk = { ord: number; text: string; start: number; end: number };

// Où couper, par ordre de préférence : fin de paragraphe, fin de phrase, espace. La coupe tombe juste
// après le séparateur.
const BOUNDARIES = [/\n\s*\n/g, /[.!?…]\s/g, /\s/g];

const WHITESPACE = /\s/;

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

// Fin du passage qui commence à `start`, quand il reste plus de PASSAGE_MAX caractères : la coupe du
// meilleur genre entre PASSAGE_MIN et PASSAGE_MAX, la plus proche de PASSAGE_TARGET ; sinon PASSAGE_MAX.
// La recherche porte sur une fenêtre de PASSAGE_MAX caractères : un très long texte reste linéaire.
function cutEnd(text: string, start: number): number {
  const window = text.slice(start, start + PASSAGE_MAX);
  for (const boundary of BOUNDARIES) {
    let best = -1;
    for (const match of window.matchAll(boundary)) {
      const end = match.index + match[0].length;
      if (end < PASSAGE_MIN) continue;
      if (best === -1 || Math.abs(end - PASSAGE_TARGET) < Math.abs(best - PASSAGE_TARGET)) {
        best = end;
      }
    }
    if (best !== -1) return start + best;
  }
  const end = start + PASSAGE_MAX;
  // Ne pas couper un caractère hors du plan de base (émoji) entre ses deux moitiés.
  return isHighSurrogate(text.charCodeAt(end - 1)) ? end - 1 : end;
}

// Début du passage suivant : le premier début de mot dans les PASSAGE_OVERLAP derniers caractères du
// passage qui finit à `end` ; à défaut, ces PASSAGE_OVERLAP caractères tels quels.
function overlapStart(text: string, end: number): number {
  const from = end - PASSAGE_OVERLAP;
  for (let index = from; index < end; index++) {
    if (WHITESPACE.test(text.charAt(index - 1)) && !WHITESPACE.test(text.charAt(index))) {
      return index;
    }
  }
  return isLowSurrogate(text.charCodeAt(from)) ? from + 1 : from;
}

export function chunkText(text: string): Chunk[] {
  const passages: Chunk[] = [];
  let start = 0;
  while (start < text.length) {
    const end = text.length - start <= PASSAGE_MAX ? text.length : cutEnd(text, start);
    const passageText = stripHighlightMarks(text.slice(start, end));
    // Un morceau fait seulement d'espaces ou de marqueurs n'apporte rien à la recherche.
    if (passageText.trim() !== '') {
      passages.push({ ord: passages.length, text: passageText, start, end });
    }
    if (end === text.length) break;
    start = overlapStart(text, end);
  }
  return passages;
}
