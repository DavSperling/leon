import { describe, expect, it } from 'vitest';
import { parseTheme, THEME_CLASS, THEME_COOKIE_OPTIONS, ThemeSchema } from './theme-cookie';

describe('cookie du thème', () => {
  it('relit les trois thèmes à l’identique', () => {
    for (const theme of ThemeSchema.options) {
      expect(parseTheme(theme)).toBe(theme);
    }
  });

  it('prend le thème clair pour toute valeur absente ou inconnue', () => {
    expect(parseTheme(undefined)).toBe('clair');
    expect(parseTheme('')).toBe('clair');
    expect(parseTheme('dark')).toBe('clair');
    expect(parseTheme('SOMBRE')).toBe('clair');
  });

  it('pose une classe par thème, aucune pour le clair', () => {
    expect(THEME_CLASS).toEqual({ clair: '', sombre: 'dark', systeme: 'theme-systeme' });
  });

  it('vaut pour tout le site, un an, sans suivre les liens externes', () => {
    expect(THEME_COOKIE_OPTIONS).toEqual({ path: '/', maxAge: 31536000, sameSite: 'lax' });
  });
});
