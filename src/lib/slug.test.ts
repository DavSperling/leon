import { describe, expect, it } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('retire les accents et met en minuscules', () => {
    expect(slugify('Dupont Rénovation')).toBe('dupont-renovation');
  });

  it('remplace la ponctuation par un tiret, sans tiret au bord', () => {
    expect(slugify("  L'Atelier & Co  ")).toBe('l-atelier-co');
  });

  it('ne garde que [a-z0-9-] et coupe à 60 caractères sans tiret final', () => {
    const slug = slugify(`Ætna ${'ab '.repeat(40)}`);
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it('renvoie une chaîne vide sans caractère utilisable', () => {
    expect(slugify('  !!! ')).toBe('');
  });
});
