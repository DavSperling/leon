import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { GoogleOneTap } from '@/components/site/google-one-tap';
import { AuthBar, LanguageChoice, ThemeChoice } from '@/components/verre/auth/bar';
import { AuthPile } from '@/components/verre/auth/frame';
import { socialProviders } from '@/server/auth/auth';

// Commune à la connexion, l'inscription, l'invitation, le mot de passe et aux deux autorisations : le bureau, la
// barre (le logo, la langue, le thème), la feuille du formulaire à gauche et, sur les pages de porte, la pile
// d'originaux à droite (AuthPile choisit). Une autorisation se lit seule, centrée. Google One Tap et la langue
// vivaient dans le cadre du site public : ils sont montés ici.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('auth');
  return (
    <div className="flex min-h-dvh flex-col bg-desk">
      <a
        href="#contenu"
        className="fixed top-3 left-3 z-50 inline-flex min-h-10 -translate-y-20 items-center rounded-full bg-ink px-4 text-ui font-medium text-on-ink transition-transform focus-visible:translate-y-0"
      >
        {t('skip')}
      </a>
      <AuthBar home="/accueil">
        <LanguageChoice />
        <ThemeChoice />
      </AuthBar>
      {socialProviders.google && <GoogleOneTap clientId={socialProviders.google.clientId} />}
      <main
        id="contenu"
        tabIndex={-1}
        className="grid flex-1 grid-cols-[minmax(0,560px)] content-center justify-center gap-x-[clamp(56px,9vw,144px)] gap-y-12 px-8 pt-2 pb-16 outline-none has-[.auth-pile]:grid-cols-[440px_minmax(0,480px)] has-[.auth-pile]:items-center max-[1099px]:has-[.auth-pile]:grid-cols-[420px_minmax(0,440px)] max-[1099px]:gap-x-14 max-[899px]:content-start max-[899px]:px-4 max-[899px]:pt-1 max-[899px]:pb-14 max-[899px]:has-[.auth-pile]:grid-cols-[minmax(0,440px)]"
      >
        {children}
        <AuthPile />
      </main>
    </div>
  );
}
