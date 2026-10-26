import { describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import requestConfig, { LOCALE_COOKIE, localeOf } from './request';

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
  }),
}));

describe('localeOf', () => {
  it('garde une langue connue, et revient au français pour tout le reste', () => {
    expect(localeOf('fr')).toBe('fr');
    expect(localeOf('en')).toBe('en');
    expect(localeOf('de')).toBe('fr');
    expect(localeOf('EN')).toBe('fr');
    expect(localeOf('')).toBe('fr');
    expect(localeOf(undefined)).toBe('fr');
  });
});

// Le setup des tests remplace getRequestConfig par l'identité : l'export par défaut est la fonction elle-même.
describe('la configuration de chaque requête', () => {
  it.each([
    ['sans cookie', undefined, 'fr'],
    ['cookie fr', 'fr', 'fr'],
    ['cookie en', 'en', 'en'],
    ['cookie inconnu', 'de', 'fr'],
  ] as const)('%s : %s', async (_, value, locale) => {
    jar.clear();
    if (value) jar.set(LOCALE_COOKIE, value);

    const config = await requestConfig({ requestLocale: Promise.resolve(undefined) });

    expect(config.locale).toBe(locale);
    expect(config.messages).toEqual(locale === 'en' ? en : fr);
  });
});
