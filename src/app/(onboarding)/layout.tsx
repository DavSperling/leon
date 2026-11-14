import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { signOutAction } from '@/app/(app)/actions';
import { AuthBar, ThemeChoice } from '@/components/verre/auth/bar';
import { Button } from '@/components/verre/ui/button';

// Les écrans d'accueil d'une personne déjà connectée : le bureau, la barre des pages de porte (le logo qui se trace, le
// thème, « Se déconnecter » : sans espace, c'est la seule sortie), puis l'étape. Chaque étape pose ses feuilles.
export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('onboarding');
  const a = await getTranslations('auth');
  return (
    <div className="flex min-h-dvh flex-col bg-desk">
      <a
        href="#contenu"
        className="fixed top-3 left-3 z-50 inline-flex min-h-10 -translate-y-20 items-center rounded-full bg-ink px-4 text-ui font-medium text-on-ink transition-transform focus-visible:translate-y-0"
      >
        {a('skip')}
      </a>
      <AuthBar>
        <ThemeChoice />
        <form action={signOutAction}>
          <Button type="submit" variant="quiet" size="sm">
            {t('signOut')}
          </Button>
        </form>
      </AuthBar>
      <main
        id="contenu"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1180px] flex-1 px-8 pt-4 pb-12 outline-none max-[899px]:px-4 max-[899px]:pt-1"
      >
        {children}
      </main>
    </div>
  );
}
