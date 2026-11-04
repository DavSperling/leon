import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import type fr from '../../messages/fr.json';

type Messages = typeof fr;

export const locales = ['fr', 'en'] as const;
export type Locale = (typeof locales)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'leon-locale';

// Les clés des messages viennent de fr.json : une clé absente fait échouer le typecheck.
declare module 'next-intl' {
  interface AppConfig {
    Messages: Messages;
  }
}

// La langue du cookie, si on la connaît ; l'anglais sinon (cookie absent ou inconnu).
export const localeOf = (value: string | undefined): Locale =>
  locales.find((locale) => locale === value) ?? DEFAULT_LOCALE;

/** Les messages d'une langue (la route /documentation.md les charge sans passer par la requête). */
export const loadMessages = async (locale: Locale): Promise<Messages> =>
  (await import(`../../messages/${locale}.json`)).default;

export default getRequestConfig(async () => {
  const locale = localeOf((await cookies()).get(LOCALE_COOKIE)?.value);
  return { locale, messages: await loadMessages(locale) };
});
