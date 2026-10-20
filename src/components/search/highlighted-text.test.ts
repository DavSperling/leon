import { describe, expect, it } from 'vitest';
import { highlightTerms } from './highlighted-text';

const hits = (text: string, terms: string[]) =>
  highlightTerms(text, terms)
    .filter((part) => part.hit)
    .map((part) => part.text);

describe('highlightTerms', () => {
  it('repère les mots cherchés, sans tenir compte de la casse', () => {
    expect(hits('Le Contrat OVH est signé', ['contrat', 'ovh'])).toEqual(['Contrat', 'OVH']);
  });

  it('rend le texte entier, dans l’ordre, avec les morceaux repérés', () => {
    expect(highlightTerms('a contrat b', ['contrat'])).toEqual([
      { text: 'a ', hit: false },
      { text: 'contrat', hit: true },
      { text: ' b', hit: false },
    ]);
  });

  it('repère un mot au pluriel, au singulier ou conjugué, comme le plein texte français', () => {
    expect(hits('Les contrats ont été renouvelés', ['contrat'])).toEqual(['contrats']);
    expect(hits('Le contrat a été renouvelé', ['contrats'])).toEqual(['contrat']);
    expect(hits('Renouvellement du contrat', ['renouvelé'])).toEqual(['Renouvellement']);
  });

  it('ne repère pas un mot au milieu d’un autre', () => {
    expect(hits('un microcontrat', ['contrat'])).toEqual([]);
  });

  it('repère un mot entouré de ponctuation et un nombre', () => {
    expect(hits('(OVH), facture n°42.', ['OVH', '42'])).toEqual(['OVH', '42']);
  });

  it('rend le texte tel quel sans mot cherché ou sans rien de trouvé', () => {
    expect(highlightTerms('rien ici', [])).toEqual([{ text: 'rien ici', hit: false }]);
    expect(highlightTerms('rien ici', ['contrat'])).toEqual([{ text: 'rien ici', hit: false }]);
    expect(highlightTerms('', ['contrat'])).toEqual([]);
  });

  it('prend les caractères spéciaux pour du texte, jamais pour une expression régulière', () => {
    expect(() => highlightTerms('a+b (c) [d] *', ['(c', '[d', 'a+', '.*', '\\'])).not.toThrow();
    expect(hits('prix c++ ici', ['c++'])).toEqual([]);
  });

  it('ne perd aucun caractère', () => {
    const text = 'Le contrat\nOVH — « renouvelé »\t!';
    const joined = highlightTerms(text, ['contrat', 'ovh', 'renouvelé'])
      .map((part) => part.text)
      .join('');

    expect(joined).toBe(text);
  });

  it('reste rapide sur un tour de 20 000 caractères', () => {
    const text = 'contrat OVH renouvelé '.repeat(1000);
    const start = performance.now();
    highlightTerms(text, ['contrat', 'ovh', 'renouvelé', 'client', 'facture']);

    expect(performance.now() - start).toBeLessThan(500);
  });
});
