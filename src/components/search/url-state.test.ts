import { describe, expect, it } from 'vitest';
import { HIGHLIGHT_END, HIGHLIGHT_START } from '@/lib/highlight';
import { PAGE_MAX, QUERY_MAX_CHARS } from '@/lib/search-limits';
import { parseQuery } from '@/server/search/parse-query';
import {
  filterTokens,
  fromSearchParams,
  hasFilter,
  searchHref,
  toSearchParams,
  withFilter,
  withoutFilter,
} from './url-state';

describe('fromSearchParams et toSearchParams', () => {
  it('font l’aller-retour de la requête et de la page', () => {
    const state = { q: 'acme', page: 2 };

    expect(fromSearchParams(toSearchParams(state))).toEqual(state);
  });

  it('écrit la page 1 et la requête vide comme rien', () => {
    expect(toSearchParams({ q: 'acme', page: 1 }).toString()).toBe('q=acme');
    expect(toSearchParams({ q: '', page: 1 }).toString()).toBe('');
    expect(toSearchParams({ q: '   ', page: 3 }).toString()).toBe('');
  });

  it('lit les paramètres de Next : une chaîne, une liste (la première), rien', () => {
    expect(fromSearchParams({ q: 'budget', page: '3' })).toEqual({ q: 'budget', page: 3 });
    expect(fromSearchParams({ q: ['un', 'deux'], page: ['4', '5'] })).toEqual({ q: 'un', page: 4 });
    expect(fromSearchParams({})).toEqual({ q: '', page: 1 });
    expect(fromSearchParams({ q: undefined, page: undefined })).toEqual({ q: '', page: 1 });
  });

  it('lit aussi un URLSearchParams', () => {
    expect(fromSearchParams(new URLSearchParams('q=acme&page=2'))).toEqual({ q: 'acme', page: 2 });
  });

  it('ramène à 1 une page nulle, négative ou qui n’est pas un nombre entier', () => {
    for (const page of [
      '0',
      '-1',
      '-7',
      'abc',
      '',
      '1.5',
      '2e3',
      ' 2',
      '0x10',
      'NaN',
      'Infinity',
    ]) {
      expect(fromSearchParams({ q: 'x', page }).page, `page=${page}`).toBe(1);
    }
  });

  it('plafonne la page, comme la recherche', () => {
    expect(fromSearchParams({ q: 'x', page: String(PAGE_MAX) }).page).toBe(PAGE_MAX);
    expect(fromSearchParams({ q: 'x', page: String(PAGE_MAX + 1) }).page).toBe(PAGE_MAX);
    expect(fromSearchParams({ q: 'x', page: '99999999999999999999' }).page).toBe(PAGE_MAX);
  });

  it('tronque la requête au plafond de la recherche', () => {
    const state = fromSearchParams({ q: 'a'.repeat(2000) });

    expect(state.q).toHaveLength(QUERY_MAX_CHARS);
    expect(toSearchParams(state).get('q')).toHaveLength(QUERY_MAX_CHARS);
  });

  it('ne coupe pas un caractère hors du plan de base en deux', () => {
    const state = fromSearchParams({ q: `${'a'.repeat(QUERY_MAX_CHARS - 1)}😀` });

    expect(state.q).toBe('a'.repeat(QUERY_MAX_CHARS - 1));
  });

  it('garde les espaces et les accents tels que tapés, sans les marqueurs de surlignage', () => {
    expect(fromSearchParams({ q: 'Réunion  du budget' }).q).toBe('Réunion  du budget');
    expect(fromSearchParams({ q: `a${HIGHLIGHT_START}b${HIGHLIGHT_END}c` }).q).toBe('abc');
  });
});

describe('searchHref', () => {
  it('mène à la page d’accueil, avec la requête encodée quand il y en a une', () => {
    expect(searchHref({ q: 'de:julie budget', page: 1 })).toBe('/?q=de%3Ajulie+budget');
    expect(searchHref({ q: 'acme', page: 2 })).toBe('/?q=acme&page=2');
    expect(searchHref({ q: '', page: 1 })).toBe('/');
  });
});

describe('filterTokens', () => {
  it('lit les cinq filtres, sans casse, avec leurs valeurs', () => {
    const tokens = filterTokens(
      'call de:julie OUTIL:github type:réunion depuis:7j avant:2026-10-01',
    );

    expect(tokens.map(({ key, value }) => [key, value])).toEqual([
      ['de', 'julie'],
      ['outil', 'github'],
      ['type', 'réunion'],
      ['depuis', '7j'],
      ['avant', '2026-10-01'],
    ]);
  });

  it('lit une valeur entre guillemets, avec ses espaces', () => {
    const [token] = filterTokens('budget de:"Julie Martin" x');

    expect(token).toMatchObject({ key: 'de', value: 'Julie Martin' });
  });

  it('donne l’emplacement exact du filtre dans la requête', () => {
    const q = 'budget de:"Julie Martin" x';
    const [token] = filterTokens(q);

    expect(token && q.slice(token.start, token.end)).toBe('de:"Julie Martin"');
  });

  it('ignore un filtre vide, et ce qui est dans une phrase entre guillemets', () => {
    expect(filterTokens('de: budget')).toEqual([]);
    expect(filterTokens('"outil:github type:ticket" budget')).toEqual([]);
    expect(filterTokens('xde:julie budget')).toEqual([]);
  });

  it('lit un guillemet non fermé comme la recherche : le filtre qui suit reste un filtre', () => {
    expect(filterTokens('"acme outil:github').map(({ key }) => key)).toEqual(['outil']);
  });

  it('ne plante sur aucune entrée étrange', () => {
    for (const q of [
      '',
      ' ',
      'a',
      '"',
      '""',
      'de:"',
      'de:""',
      'outil:',
      '\u0000de:x',
      'é'.repeat(5000),
    ]) {
      expect(() => filterTokens(q)).not.toThrow();
    }
  });

  it('lit les mêmes personnes que la recherche', () => {
    for (const q of [
      'call ACME de:julie depuis:7j',
      'de:"Julie Martin" de:bob@x.fr budget',
      '"de:inconnu" mot de:amine',
      'de: x de:y',
      'de:julie de:julie',
    ]) {
      const read = filterTokens(q)
        .filter((token) => token.key === 'de')
        .map((token) => token.value);
      const expected = parseQuery(q, new Date('2026-10-19T10:00:00Z')).people;

      expect([...new Set(read)], q).toEqual(expected);
    }
  });
});

describe('withFilter', () => {
  it('ajoute le filtre en tête : un guillemet non fermé plus loin ne l’avale pas', () => {
    expect(withFilter('budget', 'outil', 'github')).toBe('outil:github budget');
    expect(withFilter('acme "budget', 'outil', 'github')).toBe('outil:github acme "budget');
    expect(withFilter('', 'type', 'reunion')).toBe('type:reunion');
    expect(withFilter('   ', 'type', 'reunion')).toBe('type:reunion');
  });

  it('met entre guillemets une valeur à espaces, sans guillemet dedans', () => {
    expect(withFilter('x', 'de', 'Julie Martin')).toBe('de:"Julie Martin" x');
    expect(withFilter('x', 'de', 'Ju"lie')).toBe('de:"Ju lie" x');
    expect(parseQuery(withFilter('x', 'de', 'Julie Martin'), new Date()).people).toEqual([
      'Julie Martin',
    ]);
  });

  it('ne répète pas un filtre déjà là, à la casse et à la ponctuation près', () => {
    expect(withFilter('outil:GitHub x', 'outil', 'github')).toBe('outil:GitHub x');
    expect(withFilter('outil:"Claude Code" x', 'outil', 'claude_code')).toBe(
      'outil:"Claude Code" x',
    );
  });

  it('additionne les outils, les types et les personnes', () => {
    expect(withFilter('outil:github x', 'outil', 'linear')).toBe('outil:linear outil:github x');
    expect(withFilter('de:julie x', 'de', 'bob')).toBe('de:bob de:julie x');
  });

  it('remplace une date : depuis et avant n’ont qu’une valeur', () => {
    expect(withFilter('depuis:7j x', 'depuis', '30j')).toBe('depuis:30j x');
    expect(withFilter('x avant:2026-01-01 depuis:1j', 'avant', '2026-02-01')).toBe(
      'avant:2026-02-01 x depuis:1j',
    );
  });

  it('ignore une valeur vide', () => {
    expect(withFilter('x', 'de', '   ')).toBe('x');
    expect(withFilter('x', 'de', '""')).toBe('x');
  });
});

describe('withoutFilter', () => {
  it('retire le filtre et laisse le reste tel quel', () => {
    expect(withoutFilter('call de:julie budget', 'de', 'julie')).toBe('call budget');
    expect(withoutFilter('de:julie budget', 'de', 'julie')).toBe('budget');
    expect(withoutFilter('budget de:julie', 'de', 'julie')).toBe('budget');
    expect(withoutFilter('de:julie', 'de', 'julie')).toBe('');
  });

  it('retire une valeur entre guillemets', () => {
    expect(withoutFilter('x de:"Julie Martin" y', 'de', 'Julie Martin')).toBe('x y');
  });

  it('ne retire que la valeur demandée', () => {
    expect(withoutFilter('outil:github outil:linear x', 'outil', 'github')).toBe('outil:linear x');
  });

  it('retire toutes les répétitions, sans casse', () => {
    expect(withoutFilter('outil:GitHub x outil:github', 'outil', 'GITHUB')).toBe('x');
  });

  it('ne touche pas ce qui est dans une phrase entre guillemets', () => {
    expect(withoutFilter('"de:julie budget" de:julie', 'de', 'julie')).toBe('"de:julie budget"');
  });

  it('rend la requête telle quelle quand le filtre n’y est pas', () => {
    expect(withoutFilter('budget', 'de', 'julie')).toBe('budget');
  });
});

describe('hasFilter', () => {
  it('dit si le filtre est dans la requête, sans casse ni ponctuation', () => {
    expect(hasFilter('outil:"Claude Code" x', 'outil', 'claude_code')).toBe(true);
    expect(hasFilter('type:Réunion', 'type', 'reunion')).toBe(true);
    expect(hasFilter('outil:github', 'outil', 'linear')).toBe(false);
    expect(hasFilter('"outil:github"', 'outil', 'github')).toBe(false);
  });
});
