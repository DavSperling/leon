import { describe, expect, it } from 'vitest';
import { filterSlashItems, SLASH_ITEMS } from './slash-menu';

const labels = (query: string) => filterSlashItems(query).map((item) => item.label);

describe('filterSlashItems', () => {
  it('propose tous les blocs de la spec avant toute saisie', () => {
    expect(labels('')).toEqual([
      'Titre 1',
      'Titre 2',
      'Titre 3',
      'Liste',
      'Liste numérotée',
      'Cases à cocher',
      'Bloc de code',
      'Citation',
      'Séparateur',
    ]);
  });

  it('filtre par le libellé, sans accents ni majuscules', () => {
    expect(labels('titre')).toEqual(['Titre 1', 'Titre 2', 'Titre 3']);
    expect(labels('LISTE')).toEqual(['Liste', 'Liste numérotée']);
    expect(labels('numerotee')).toEqual(['Liste numérotée']);
    expect(labels('separateur')).toEqual(['Séparateur']);
  });

  it('ne propose rien quand aucun libellé ne convient', () => {
    expect(labels('zzz')).toEqual([]);
  });

  it('donne à chaque bloc un identifiant et un raccourci Markdown distincts', () => {
    expect(new Set(SLASH_ITEMS.map((item) => item.id)).size).toBe(SLASH_ITEMS.length);
    expect(new Set(SLASH_ITEMS.map((item) => item.shortcut)).size).toBe(SLASH_ITEMS.length);
  });
});
