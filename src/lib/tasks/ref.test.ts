import { describe, expect, it } from 'vitest';
import { branchName, formatTaskRef, parseTaskRef, projectKeyFrom } from './ref';

describe('formatTaskRef', () => {
  it('assemble la clé du projet et le numéro', () => {
    expect(formatTaskRef('LEO', 12)).toBe('LEO-12');
  });
});

describe('parseTaskRef', () => {
  it('lit un identifiant sans tenir compte de la casse', () => {
    expect(parseTaskRef('leo-12')).toEqual({ key: 'LEO', number: 12 });
    expect(parseTaskRef('Leo-1')).toEqual({ key: 'LEO', number: 1 });
    expect(parseTaskRef('AB2-999999999')).toEqual({ key: 'AB2', number: 999_999_999 });
  });

  it.each([
    '',
    'LEO',
    'LEO-',
    'LEO-0',
    'LEO-012',
    'LEO-1234567890',
    'LEO-1.5',
    'LEO12',
    'L-1',
    'ABCDEFGHIJK-1',
    '1EO-12',
    ' LEO-12',
    'LEO-12 ',
    'LEO-12-3',
    'LÉO-12',
  ])('refuse « %s »', (text) => {
    expect(parseTaskRef(text)).toBeNull();
  });
});

describe('branchName', () => {
  it('préfixe par le prénom et résume le titre', () => {
    expect(branchName('LEO-12', 'Corriger la mise en page', 'Amos')).toBe(
      'amos/leo-12-corriger-la-mise-en-page',
    );
  });

  it('passe le prénom et le titre en ASCII', () => {
    expect(branchName('LEO-3', "L'éléphant à l'œuvre", 'Éloïse')).toBe(
      'eloise/leo-3-l-elephant-a-l-uvre',
    );
  });

  it('omet le prénom quand il est vide', () => {
    expect(branchName('LEO-12', 'Titre court', '')).toBe('leo-12-titre-court');
    expect(branchName('LEO-12', 'Titre court', '  ')).toBe('leo-12-titre-court');
  });

  it('coupe un titre accentué de 120 caractères à 60 caractères, sans prénom', () => {
    const title = 'Réparer l’éléphant écrasé près du château '.repeat(3).slice(0, 120);
    const name = branchName('LEO-12', title, '');
    expect(title).toHaveLength(120);
    expect(name.length).toBeLessThanOrEqual(60);
    expect(name).toMatch(/^leo-12-reparer-l-elephant-ecrase-pres-du-chateau-reparer/);
    expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('garde 60 caractères au plus avec le prénom', () => {
    const title = 'Réparer l’éléphant écrasé près du château '.repeat(3);
    const name = branchName('LEO-12', title, 'Amos');
    expect(name.length).toBeLessThanOrEqual(60);
    expect(name.startsWith('amos/leo-12-reparer-')).toBe(true);
  });

  it('ne finit jamais par un tiret', () => {
    // Le 60e caractère tombe sur le tiret qui suit le mot.
    expect(branchName('LEO-12', `${'a'.repeat(52)} suite`, '')).toBe(`leo-12-${'a'.repeat(52)}`);
    expect(branchName('LEO-12', `${'a'.repeat(47)} suite`, 'Amos')).toBe(
      `amos/leo-12-${'a'.repeat(47)}`,
    );
  });
});

describe('projectKeyFrom', () => {
  it('prend les trois premières lettres sans accent, en majuscules', () => {
    expect(projectKeyFrom("Rénov'Ouest")).toBe('REN');
    expect(projectKeyFrom('Leon')).toBe('LEO');
    expect(projectKeyFrom('  été 2026')).toBe('ETE');
  });

  it('ignore les chiffres et la ponctuation', () => {
    expect(projectKeyFrom('42 rue de la Paix')).toBe('RUE');
  });

  it('accepte un nom de deux lettres', () => {
    expect(projectKeyFrom('Çà')).toBe('CA');
  });

  it('retombe sur TCH sans deux lettres', () => {
    expect(projectKeyFrom('')).toBe('TCH');
    expect(projectKeyFrom('A')).toBe('TCH');
    expect(projectKeyFrom('2026 !!!')).toBe('TCH');
    expect(projectKeyFrom('日本語')).toBe('TCH');
  });
});
