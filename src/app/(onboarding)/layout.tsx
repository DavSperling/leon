import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { signOutAction } from '@/app/(app)/actions';
import { StandaloneShell } from '@/components/verre/shell';
import { Brand } from '@/components/verre/shell/brand';
import { Button } from '@/components/verre/ui/button';
import { GlassCard } from '@/components/verre/ui/surfaces';

// Les écrans d'accueil d'une personne déjà connectée : la marque, « Se déconnecter » (la session suffit : sans espace,
// c'est la seule sortie), puis une large carte de verre. Pas d'en-tête du site public.
export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('onboarding');
  return (
    <StandaloneShell>
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-8 sm:py-10">
        <header className="flex h-9 items-center justify-between gap-4">
          <Brand />
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              {t('signOut')}
            </Button>
          </form>
        </header>
        <GlassCard
          variant="raised"
          signal
          className="rise-in mt-5 p-5 shadow-panel backdrop-blur-[30px] sm:p-8"
        >
          <div className="relative z-[1]">{children}</div>
        </GlassCard>
      </div>
    </StandaloneShell>
  );
}
