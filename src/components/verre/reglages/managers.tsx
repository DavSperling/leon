'use client';

import { useTranslations } from 'next-intl';
import { useOptimistic, useTransition } from 'react';
import { setManagersSeeAllAction } from '@/app/(app)/reglages/actions';
import { GlassCard, Section, Switch, toast } from '@/components/verre';
import { nb } from '@/lib/verre';
import { SECTION } from './reglages';

/**
 * Section « Managers », pour un propriétaire ou un administrateur : les managers lisent-ils le privé des gens sous eux
 * (0057). Oui par défaut ; chaque manager peut encore le couper personne par personne dans « Mon équipe ».
 */
export function ManagersSection({ on }: { on: boolean }) {
  const t = useTranslations('settings');
  // l'interrupteur suit le clic tout de suite ; un refus le remet comme la page le relit
  const [shown, setShown] = useOptimistic(on);
  const [, startTransition] = useTransition();
  const toggle = (next: boolean) =>
    startTransition(async () => {
      setShown(next);
      try {
        const { ok } = await setManagersSeeAllAction(next);
        if (!ok) toast.error(t('managersFailed'));
      } catch {
        toast.error(t('managersFailed'));
      }
    });

  return (
    <Section
      id="managers"
      title={t('managersTitle')}
      description={t('managersDescription')}
      className={SECTION}
    >
      <GlassCard className="grid gap-2 p-4">
        <Switch
          label={t('managersToggle')}
          checked={shown}
          onCheckedChange={toggle}
          aria-describedby="managers-loi"
        />
        <p id="managers-loi" className="text-label text-muted">
          {nb(t('managersLaw'))}
        </p>
      </GlassCard>
    </Section>
  );
}
