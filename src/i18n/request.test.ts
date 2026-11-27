import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSession } from '@/server/auth/session';
import { logError } from '@/server/log';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import requestConfig, { LOCALE_COOKIE, localeOf } from './request';

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
  }),
}));
// La session, que la requête lit pour la langue du compte : personne n'est connecté, sauf dit autrement.
vi.mock('@/server/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/server/log', () => ({ logError: vi.fn() }));
const signedIn = (locale: string | null) =>
  vi.mocked(getSession).mockResolvedValue({ user: { locale } } as never);

beforeEach(() => {
  jar.clear();
  vi.mocked(getSession).mockReset().mockResolvedValue(null);
});

describe('localeOf', () => {
  it('garde une langue connue, et revient à l’anglais pour tout le reste', () => {
    expect(localeOf('fr')).toBe('fr');
    expect(localeOf('en')).toBe('en');
    expect(localeOf('de')).toBe('en');
    expect(localeOf('FR')).toBe('en');
    expect(localeOf('')).toBe('en');
    expect(localeOf(undefined)).toBe('en');
  });
});

// Le setup des tests remplace getRequestConfig par l'identité : l'export par défaut est la fonction elle-même.
describe('la configuration de chaque requête', () => {
  it.each([
    ['sans cookie', undefined, 'en'],
    ['cookie fr', 'fr', 'fr'],
    ['cookie en', 'en', 'en'],
    ['cookie inconnu', 'de', 'en'],
  ] as const)('%s : %s', async (_, value, locale) => {
    if (value) jar.set(LOCALE_COOKIE, value);

    const config = await requestConfig({ requestLocale: Promise.resolve(undefined) });

    expect(config.locale).toBe(locale);
    expect(config.messages).toEqual(locale === 'en' ? en : fr);
  });

  // La langue choisie se garde avec le compte (0094) : un autre navigateur, ou des cookies effacés, ne la perdent plus.
  it.each([
    ['le compte en français, sans cookie', 'fr', undefined, 'fr'],
    ['le compte en français, un cookie anglais', 'fr', 'en', 'fr'],
    ['le compte en anglais, un cookie français', 'en', 'fr', 'en'],
    ['un compte sans langue choisie : le cookie', null, 'fr', 'fr'],
    ['un compte sans langue choisie, sans cookie', null, undefined, 'en'],
    ['une langue de compte inconnue : le cookie', 'de', 'fr', 'fr'],
  ] as const)('connectée, %s', async (_, account, cookie, locale) => {
    signedIn(account);
    if (cookie) jar.set(LOCALE_COOKIE, cookie);

    const config = await requestConfig({ requestLocale: Promise.resolve(undefined) });

    expect(config.locale).toBe(locale);
    expect(config.messages).toEqual(locale === 'en' ? en : fr);
  });

  it('une session illisible ne prive pas la page de sa langue : le cookie décide, et la panne est notée', async () => {
    const down = new Error('base injoignable');
    vi.mocked(getSession).mockRejectedValue(down);
    jar.set(LOCALE_COOKIE, 'fr');

    const config = await requestConfig({ requestLocale: Promise.resolve(undefined) });

    expect(config.locale).toBe('fr');
    expect(logError).toHaveBeenCalledWith('langue.compte', down);
  });
});
