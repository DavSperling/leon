import { getTranslations } from 'next-intl/server';
import { isDepartment } from '@/lib/onboarding';
import type { OnboardingMember } from '@/server/auth/onboarding';

/**
 * Les trois questions à essayer (Accueil, nouvelle discussion) : les deux du service de la personne, et une sur ce qui
 * a bougé (l'outil `activite` de l'agent y répond) ; sans service, trois questions qui valent pour tous.
 */
export async function askSuggestions(member: Pick<OnboardingMember, 'department'> | null) {
  const t = await getTranslations('welcome');
  const department = member?.department;
  if (department && isDepartment(department)) {
    const asks = await getTranslations('onboarding');
    return [asks(`asks.${department}.one`), asks(`asks.${department}.two`), t('askRecent')];
  }
  return [t('askFallback.one'), t('askFallback.two'), t('askRecent')];
}
