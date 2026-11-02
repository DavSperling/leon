'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { OnboardingStepId } from '@/lib/onboarding';
import { cn } from '@/lib/verre/cn';

/**
 * Le fil d'étapes en tête d'un écran d'onboarding : les étapes passées sont cochées, celle en cours porte
 * `aria-current="step"`. Avec une seule étape, rien à montrer. Sous 640 px seule l'étape en cours garde son nom
 * (le nom reste lu par les lecteurs d'écran) : trois noms, « Collaborateurs » compris, ne tiennent pas dans 303 px.
 */
export function OnboardingSteps({
  steps,
  current,
}: {
  steps: OnboardingStepId[];
  current: OnboardingStepId;
}) {
  const t = useTranslations('onboarding.steps');
  if (steps.length < 2) return null;
  const at = steps.indexOf(current);
  return (
    <ol aria-label={t('label')} className="m-0 flex list-none items-center gap-2 p-0">
      {steps.map((id, i) => {
        const done = i < at;
        const here = i === at;
        const last = i === steps.length - 1;
        return (
          <li
            key={id}
            aria-current={here ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2 text-label whitespace-nowrap',
              !last && 'flex-1',
              here ? 'font-semibold text-fg' : done ? 'text-fg-2' : 'text-muted',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-full border text-meta',
                here
                  ? 'border-accent bg-accent text-accent-ink'
                  : done
                    ? 'border-accent-line bg-accent-soft text-accent'
                    : 'border-line-strong',
              )}
            >
              {done ? <Check strokeWidth={2.2} className="size-3.5" /> : i + 1}
            </span>
            <span className={cn(!here && 'max-sm:sr-only')}>
              {t(id)}
              {done && <span className="sr-only">, {t('completed')}</span>}
            </span>
            {!last && (
              <span
                aria-hidden="true"
                className={cn('h-px min-w-4 flex-1', done ? 'bg-accent-line' : 'bg-line-strong')}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
