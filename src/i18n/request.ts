import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { logError } from '@/server/log';
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

// La langue que la personne connectée a choisie, gardée avec son compte (user.locale, 0094) : elle la retrouve à
// chaque connexion, sur n'importe quel navigateur. Elle vient avec la session, que le rendu a déjà lue (getSession,
// une fois par rendu) ; sans cookie de session, rien n'est lu en base. Import à la demande : auth.ts importe ce
// fichier. Une lecture en panne ne prive pas la page de sa langue : le cookie décide, et la panne est notée (sans
// cela, tout le monde repasserait en silence à la langue de son navigateur).
async function accountLocale(): Promise<Locale | null> {
  try {
    const { getSession } = await import('@/server/auth/session');
    const chosen = (await getSession())?.user.locale;
    return locales.find((locale) => locale === chosen) ?? null;
  } catch (error) {
    logError('langue.compte', error);
    return null;
  }
}

// La langue du compte d'abord ; sinon, et pour qui n'est pas connecté, celle du cookie de ce navigateur.
export default getRequestConfig(async () => {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = (await accountLocale()) ?? localeOf(cookie);
  return { locale, messages: await loadMessages(locale) };
});
