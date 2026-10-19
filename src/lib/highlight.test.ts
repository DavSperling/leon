import { describe, expect, it } from 'vitest';
import { HIGHLIGHT_END, HIGHLIGHT_START, splitHighlights, stripHighlightMarks } from './highlight';

const START = HIGHLIGHT_START;
const END = HIGHLIGHT_END;

describe('marqueurs de surlignage', () => {
  it('sont deux caractères de la zone privée, U+E000 et U+E001', () => {
    expect(HIGHLIGHT_START).toBe('\uE000');
    expect(HIGHLIGHT_END).toBe('\uE001');
  });
});

describe('splitHighlights', () => {
  it('découpe un extrait en morceaux surlignés ou non', () => {
    expect(splitHighlights(`a${START}b${END}c`)).toEqual([
      { text: 'a', hit: false },
      { text: 'b', hit: true },
      { text: 'c', hit: false },
    ]);
  });

  it('rend un seul morceau pour un texte sans marqueur', () => {
    expect(splitHighlights('abc')).toEqual([{ text: 'abc', hit: false }]);
    expect(splitHighlights('')).toEqual([]);
  });

  it('gère un surlignage au début, à la fin et plusieurs de suite', () => {
    expect(splitHighlights(`${START}un${END} et ${START}deux${END}`)).toEqual([
      { text: 'un', hit: true },
      { text: ' et ', hit: false },
      { text: 'deux', hit: true },
    ]);
  });

  it('traite un marqueur orphelin comme du texte, sans ouvrir de surlignage', () => {
    expect(splitHighlights(`a${START}b`)).toEqual([{ text: `a${START}b`, hit: false }]);
    expect(splitHighlights(`a${END}b`)).toEqual([{ text: `a${END}b`, hit: false }]);
    // Un début orphelin suivi d'un surlignage complet : seul le second est un surlignage.
    expect(splitHighlights(`a${START}b${START}c${END}d`)).toEqual([
      { text: `a${START}b`, hit: false },
      { text: 'c', hit: true },
      { text: 'd', hit: false },
    ]);
  });

  it('ignore un surlignage vide', () => {
    expect(splitHighlights(`a${START}${END}b`)).toEqual([{ text: 'ab', hit: false }]);
  });

  it('ne produit jamais de HTML : le texte reste tel quel', () => {
    expect(splitHighlights(`<b>${START}<i>x</i>${END}</b>`)).toEqual([
      { text: '<b>', hit: false },
      { text: '<i>x</i>', hit: true },
      { text: '</b>', hit: false },
    ]);
  });
});

describe('stripHighlightMarks', () => {
  it('retire les deux marqueurs, où qu’ils soient', () => {
    expect(stripHighlightMarks(`${START}a${END}b${START}`)).toBe('ab');
    expect(stripHighlightMarks('rien à retirer')).toBe('rien à retirer');
  });
});
