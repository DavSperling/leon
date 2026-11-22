import type { FicheLine } from '@/server/portrait/fiche';
import type { Genre, ValeurDe } from '@/server/portrait/lines';

// Ce que l'écran « Ma fiche » et la fiche enregistrée (portrait/) partagent. Module pur, que le navigateur lit : il
// n'importe du serveur que des types.

// Les longueurs des textes que la personne corrige : la forme des lignes (portrait/lines.ts) et les champs de l'écran
// lisent les mêmes.
export const FICHE_MAX = { role: 300, titre: 80, detail: 300 } as const;

export type Ligne<G extends Genre> = Omit<FicheLine, 'genre' | 'valeur'> & {
  genre: G;
  valeur: ValeurDe<G>;
};

// Les lignes d'un genre. readFiche a validé chaque valeur dans la forme de son genre : le type ne fait que le redire.
export const linesOf = <G extends Genre>(lines: FicheLine[], genre: G): Ligne<G>[] =>
  lines.filter((line) => line.genre === genre) as Ligne<G>[];
