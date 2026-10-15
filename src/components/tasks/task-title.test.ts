import { describe, expect, it } from 'vitest';
import { splitInlineCode } from './task-title';

describe('splitInlineCode', () => {
  it('laisse un titre sans accent grave en un seul segment', () => {
    expect(splitInlineCode('Corriger le tri')).toEqual([
      { start: 0, text: 'Corriger le tri', code: false },
    ]);
  });

  it('isole le code entre accents graves', () => {
    expect(splitInlineCode('Un client peut créer `pending` direct')).toEqual([
      { start: 0, text: 'Un client peut créer ', code: false },
      { start: 21, text: 'pending', code: true },
      { start: 30, text: ' direct', code: false },
    ]);
  });

  it('gère le code au début, à la fin et plusieurs fois', () => {
    expect(splitInlineCode('`a` et `b`')).toEqual([
      { start: 0, text: 'a', code: true },
      { start: 3, text: ' et ', code: false },
      { start: 7, text: 'b', code: true },
    ]);
  });

  it('garde un accent grave isolé ou vide comme du texte', () => {
    expect(splitInlineCode('un ` seul')).toEqual([{ start: 0, text: 'un ` seul', code: false }]);
    expect(splitInlineCode('vide `` ici')).toEqual([
      { start: 0, text: 'vide `` ici', code: false },
    ]);
  });

  it('rend une liste vide pour un titre vide', () => {
    expect(splitInlineCode('')).toEqual([]);
  });
});
