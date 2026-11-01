import { describe, expect, it } from 'vitest';
import { navFor, sectionOf } from './nav';

describe('navFor', () => {
  it('ne montre « Développeurs » qu’à un membre qui code, avant Réglages', () => {
    expect(navFor(false).map((item) => item.href)).not.toContain('/developpeurs');
    expect(navFor(true).map((item) => item.href)).toEqual([
      '/',
      '/discussions',
      '/documents',
      '/connexions',
      '/developpeurs',
      '/reglages',
    ]);
  });

  it('reconnaît la section de la page Développeurs', () => {
    expect(sectionOf('/developpeurs')?.labelKey).toBe('developers');
  });
});
