'use client';

import { useTranslations } from 'next-intl';
import { useOptimistic, useTransition } from 'react';
import { setManagersSeeAllAction } from '@/app/(app)/reglages/actions';
import { Switch, toast } from '@/components/verre';
import { nb } from '@/lib/verre';

/**
 * L'interrupteur « Managers », pour un propriétaire ou un administrateur : les managers lisent-ils le privé des gens
 * sous eux (0057). Oui par défaut ; il s'applique tout de suite. La phrase de la loi reste dessous : Leon ne prévient
 * pas les employés à la place de l'entreprise.
 */
export function ManagersSwitch({ on }: { on: boolean }) {
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
    <div className="grid gap-1.5">
      <Switch
        label={t('managersToggle')}
        checked={shown}
        onCheckedChange={toggle}
        aria-describedby="managers-loi"
      />
      <p id="managers-loi" className="text-label text-muted">
        {nb(t('managersLaw'))}
      </p>
    </div>
  );
}
