'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/verre/ui/button';
import { nb } from '@/lib/verre/nb';

/**
 * L'écran de fin de l'onboarding : « Open Chat », et à droite (dessous en dessous de 1024 px) ce que Leon fait de l'espace.
 * `owner` : le propriétaire prépare son espace ; qui a été invité le trouve prêt.
 */
export function DoneStep({ owner }: { owner: boolean }) {
  const t = useTranslations('onboarding.done');
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:gap-10">
      <div className="grid min-w-0 content-start justify-items-start gap-5">
        <span
          aria-hidden="true"
          className="grid size-12 place-items-center rounded-full border border-accent-line bg-accent-soft text-accent"
        >
          <Check strokeWidth={2} className="size-6" />
        </span>
        <div>
          <h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">{t('title')}</h1>
          <p className="mt-2 text-body text-muted">{nb(t('lead'))}</p>
        </div>
        <Button asChild variant="primary" size="lg">
          <Link href="/discussions">{t('openChat')}</Link>
        </Button>
      </div>

      <div className="grid min-h-48 min-w-0 content-center rounded-box border border-line bg-glass p-4 sm:p-6">
        <p className="text-center text-h2 font-semibold tracking-[-0.018em] text-fg-2">
          {owner ? t('ownerReady') : t('memberReady')}
        </p>
      </div>
    </div>
  );
}
