// Les notes d'une réponse, dans la marge de sa feuille. Module pur (testé à part).

/**
 * La place de chaque note, de haut en bas : à la hauteur voulue (celle du premier renvoi à sa source), ou sous la
 * précédente si elles se toucheraient. Une note sans hauteur voulue (`Infinity` : aucun renvoi dans le texte) suit
 * la dernière. `notes` est déjà dans l'ordre du texte.
 */
export function stackNotes(
  notes: Array<{ y: number; height: number }>,
  start: number,
  gap: number,
): number[] {
  let floor = start;
  return notes.map(({ y, height }) => {
    const at = Math.round(Math.max(floor, Number.isFinite(y) ? y : floor));
    floor = at + height + gap;
    return at;
  });
}
