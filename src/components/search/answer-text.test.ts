import { describe, expect, it } from 'vitest';
import { answerSegments, resultAnchorId } from './answer-text';

describe('answerSegments', () => {
  it('sépare le texte des renvois aux résultats de la page', () => {
    expect(answerSegments('Le contrat est renouvelé [1], le devis signé [2][3].', 3)).toEqual([
      { text: 'Le contrat est renouvelé ' },
      { ref: 1 },
      { text: ', le devis signé ' },
      { ref: 2 },
      { ref: 3 },
      { text: '.' },
    ]);
  });

  it('écarte un renvoi à un résultat absent de la page', () => {
    expect(answerSegments('a [4] b [0] c [1]', 3)).toEqual([{ text: 'a  b  c ' }, { ref: 1 }]);
  });

  it('laisse tel quel ce qui n’est pas un renvoi', () => {
    expect(answerSegments('tableau [a] et [1 et ]', 3)).toEqual([
      { text: 'tableau [a] et [1 et ]' },
    ]);
  });

  // Audit 3 n° 9.
  it('laisse un indice de tableau dans le texte, sans le retirer ni le lire comme un renvoi', () => {
    expect(answerSegments('Voir [1] : argv[0], items[1][2] et f(x)[9].', 3)).toEqual([
      { text: 'Voir ' },
      { ref: 1 },
      { text: ' : argv[0], items[1][2] et f(x)[9].' },
    ]);
  });

  it('rend une liste vide pour un texte vide', () => {
    expect(answerSegments('', 3)).toEqual([]);
  });
});

describe('resultAnchorId', () => {
  it('donne l’ancre d’un résultat à partir de sa source', () => {
    expect(resultAnchorId('11111111-1111-4111-8111-111111111111')).toBe(
      'resultat-11111111-1111-4111-8111-111111111111',
    );
  });
});
