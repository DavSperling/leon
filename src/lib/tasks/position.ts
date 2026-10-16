const STEP = 1024;

// Position d'une tâche rangée entre deux voisines : `before` est la position de celle qui la précède,
// `after` de celle qui la suit (null en tête ou en fin de colonne, ou dans une colonne vide).
export function positionBetween(before: number | null, after: number | null): number {
  if (before !== null && after !== null) return (before + after) / 2;
  if (after !== null) return after - STEP;
  if (before !== null) return before + STEP;
  return 0;
}
