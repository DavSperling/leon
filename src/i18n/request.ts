import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import type fr from '../../messages/fr.json';

export const locales = ['fr', 'en'] as const;
export type Locale = (typeof locales)[number];
export const DEFAULT_LOCALE: Locale = 'fr';
export const LOCALE_COOKIE = 'leon-locale';

// Les clés des messages viennent de fr.json : une clé absente fait échouer le typecheck.
declare module 'next-intl' {
  interface AppConfig {
    Messages: typeof fr;
  }
}

// La langue du cookie, si on la connaît ; le français sinon (cookie absent ou inconnu).
export const localeOf = (value: string | undefined): Locale =>
  locales.find((locale) => locale === value) ?? DEFAULT_LOCALE;

export default getRequestConfig(async () => {
  const locale = localeOf((await cookies()).get(LOCALE_COOKIE)?.value);
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
