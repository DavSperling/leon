'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { OnboardingStepId } from '@/lib/onboarding';
import { cn } from '@/lib/verre/cn';
import './onboarding.css';

/**
 * Le fil d'étapes en tête d'un écran d'onboarding, sur le bureau : un trait par étape. Fait : le trait à l'encre et sa
 * coche ; en cours (`aria-current="step"`) : son trait est tracé une fois ; à venir : un trait gris. Une étape faite
 * où l'on peut revenir (`back`) est un lien. Avec une seule étape, rien à montrer. Sous 640 px seule l'étape en cours
 * garde son nom (le nom reste lu par les lecteurs d'écran).
 */
export function OnboardingSteps({
  steps,
  current,
  back = {},
}: {
  steps: OnboardingStepId[];
  current: OnboardingStepId;
  /** Où mène une étape déjà faite, quand le produit permet d'y revenir. */
  back?: Partial<Record<OnboardingStepId, string>>;
}) {
  const t = useTranslations('onboarding.steps');
  if (steps.length < 2) return null;
  const at = steps.indexOf(current);
  return (
    <ol aria-label={t('label')} className="m-0 flex max-w-[520px] list-none gap-2 p-0">
      {steps.map((id, i) => {
        const done = i < at;
        const here = i === at;
        const href = done ? back[id] : undefined;
        const inside = (
          <>
            {done && <Check aria-hidden="true" strokeWidth={2.4} className="size-3.5 shrink-0" />}
            <span className={cn('truncate', !here && 'max-sm:sr-only')}>
              {t(id)}
              {done && <span className="sr-only">, {t('completed')}</span>}
            </span>
          </>
        );
        const className = cn('ob-step', done && 'is-done');
        return (
          <li key={id} className="flex min-w-0 flex-1 basis-0 sm:max-w-[176px]">
            {href ? (
              <Link href={href} className={cn(className, 'rounded-sm')}>
                {inside}
              </Link>
            ) : (
              <span aria-current={here ? 'step' : undefined} className={className}>
                {inside}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** La feuille d'une étape, posée sur le bureau : celle des pages de connexion. */
export const SHEET =
  'min-w-0 rounded-card border border-line bg-sheet p-8 shadow-lift max-[599px]:px-5 max-[599px]:py-6';

/** Une puce choisie parmi d'autres (langue, taille, objectifs) : un trait d'encre et sa coche, pas un aplat d'encre. */
export const PICK =
  'aria-pressed:border-fg aria-pressed:bg-sheet aria-pressed:text-fg aria-pressed:[&_svg]:text-fg';
