import { describe, expect, it } from 'vitest';
import { stackNotes } from './note-places';

describe('stackNotes', () => {
  it('pose chaque note à la hauteur de son renvoi quand rien ne se touche', () => {
    expect(
      stackNotes(
        [
          { y: 131, height: 22 },
          { y: 290, height: 36 },
        ],
        24,
        10,
      ),
    ).toEqual([131, 290]);
  });

  it('range sous la précédente deux notes de la même ligne, et jamais au-dessus du haut de la feuille', () => {
    expect(
      stackNotes(
        [
          { y: 4, height: 22 },
          { y: 4, height: 54 },
          { y: 60, height: 22 },
        ],
        24,
        10,
      ),
    ).toEqual([24, 56, 120]);
  });

  it('met après les autres une source sans renvoi dans le texte', () => {
    expect(
      stackNotes(
        [
          { y: 100, height: 22 },
          { y: Number.POSITIVE_INFINITY, height: 22 },
        ],
        24,
        10,
      ),
    ).toEqual([100, 132]);
  });
});
