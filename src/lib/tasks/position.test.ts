import { describe, expect, it } from 'vitest';
import { positionBetween } from './position';

describe('positionBetween', () => {
  it('prend le milieu entre deux voisines', () => {
    expect(positionBetween(1024, 2048)).toBe(1536);
    expect(positionBetween(-3, 1)).toBe(-1);
  });

  it("se place avant la première quand il n'y a pas de voisine au-dessus", () => {
    expect(positionBetween(null, 1024)).toBe(0);
    expect(positionBetween(null, 0)).toBe(-1024);
  });

  it("se place après la dernière quand il n'y a pas de voisine en dessous", () => {
    expect(positionBetween(2048, null)).toBe(3072);
  });

  it('vaut zéro dans une colonne vide', () => {
    expect(positionBetween(null, null)).toBe(0);
  });

  it('reste strictement entre deux voisines après de nombreuses insertions au même endroit', () => {
    let after = 1024;
    for (let i = 0; i < 40; i++) {
      const position = positionBetween(0, after);
      expect(position).toBeGreaterThan(0);
      expect(position).toBeLessThan(after);
      after = position;
    }
  });
});
