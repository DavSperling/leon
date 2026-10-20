import { describe, expect, it } from 'vitest';
import { createReferenceFilter, referencedNumbers } from './references';

const run = (allowed: { has(n: number): boolean }, chunks: string[]) => {
  const filter = createReferenceFilter(allowed);
  return chunks.map((chunk) => filter.push(chunk)).join('') + filter.flush();
};

describe('createReferenceFilter', () => {
  it('garde les renvois fournis et écarte les autres avec leur espace', () => {
    expect(run(new Set([1, 3]), ['Oui [1], non [2], peut-être [3].'])).toBe(
      'Oui [1], non, peut-être [3].',
    );
  });

  it('écrit une liste en un renvoi par crochet, sans doublon', () => {
    expect(run(new Set([1, 3]), ['Voir [1, 3; 1, 9].'])).toBe('Voir [1][3].');
  });

  it('lit un renvoi coupé entre deux morceaux', () => {
    const filter = createReferenceFilter(new Set([12]));
    expect(filter.push('Le contrat [')).toBe('Le contrat');
    expect(filter.push('12] est signé')).toBe(' [12] est signé');
    expect(filter.flush()).toBe('');
  });

  // La discussion numérote au fil des outils : un numéro n'est connu qu'une fois l'outil exécuté.
  it('consulte la liste au moment où le renvoi est lu', () => {
    const known = new Set<number>();
    const filter = createReferenceFilter(known);
    const before = filter.push('Trop tôt [1]. ');
    known.add(1);
    const after = filter.push('À temps [1].');

    expect(before + after + filter.flush()).toBe('Trop tôt. À temps [1].');
  });

  // Audit 3 n° 9 : un indice de tableau dans du code n'est pas un renvoi ; il reste tel quel.
  it('laisse tel quel un crochet collé à un mot, à « ] » ou à « ) »', () => {
    const code = 'Lisez argv[0] puis items[1][2], f(x)[3] et été[4].';
    expect(run(new Set([1]), [code])).toBe(code);
    expect(run(new Set([1, 2]), ['Voir [1][2][9] et argv[1].'])).toBe('Voir [1][2] et argv[1].');
  });

  it('garde le contexte entre deux morceaux', () => {
    expect(run(new Set([1]), ['Lisez argv', '[0] et items[', '1] puis [1]', '[9].'])).toBe(
      'Lisez argv[0] et items[1] puis [1].',
    );
  });
});

describe('referencedNumbers', () => {
  it('rend les numéros cités, une fois chacun, dans l’ordre croissant', () => {
    expect(referencedNumbers('Oui [3] et [1][3], pas [x] ni [0].')).toEqual([1, 3]);
  });

  it('ne prend pas un indice de tableau pour un renvoi', () => {
    expect(referencedNumbers('Voir [2] ; argv[1], items[3][4], f(x)[5].')).toEqual([2]);
  });
});
