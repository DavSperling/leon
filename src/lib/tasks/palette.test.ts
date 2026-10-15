import { describe, expect, it } from 'vitest';
import { COLOR_NAMES, COLOR_PALETTE, nextColor } from './palette';

describe('nextColor', () => {
  it('commence par la première couleur de la palette', () => {
    expect(nextColor([])).toBe(COLOR_PALETTE[0]);
  });

  it('saute les couleurs déjà prises', () => {
    expect(nextColor([COLOR_PALETTE[0], COLOR_PALETTE[2]])).toBe(COLOR_PALETTE[1]);
  });

  it('reprend la palette quand elle est épuisée', () => {
    expect(nextColor([...COLOR_PALETTE])).toBe(COLOR_PALETTE[0]);
    expect(nextColor([...COLOR_PALETTE, '#000000'])).toBe(COLOR_PALETTE[1]);
  });
});

describe('COLOR_NAMES', () => {
  it('nomme chaque couleur de la palette, sans doublon', () => {
    const names = COLOR_PALETTE.map((color) => COLOR_NAMES[color]);
    expect(new Set(names).size).toBe(COLOR_PALETTE.length);
  });
});
