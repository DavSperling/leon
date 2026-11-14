'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { DoneMark, Select, type SelectOption } from '@/components/verre';
import { departmentLabelKey } from '@/lib/onboarding';
import { cn } from '@/lib/verre/cn';

// Un groupe tel que la page des documents le reçoit (listGroups) : un service, ou un groupe libre et son nom.
export type GroupOption = { id: string; service: string | null; nom: string | null };

// « Toute l'équipe », « Moi seul », puis chaque groupe : les valeurs de PartageSchema (documents.ts).
export function usePartageOptions(groups: GroupOption[]): SelectOption[] {
  const t = useTranslations('documents');
  const o = useTranslations('onboarding');
  return [
    { value: 'equipe', label: t('shareTeam') },
    { value: 'moi', label: t('shareMe') },
    ...groups.map((g) => ({
      value: g.id,
      label: g.nom ?? (g.service ? o(departmentLabelKey(g.service)) : t('shareGroup')),
    })),
  ];
}

// Le libellé d'un partage déjà fait ; un groupe que la liste ne connaît plus se dit « Un groupe ».
export function usePartageLabel(groups: GroupOption[]): (partage: string) => string {
  const t = useTranslations('documents');
  const options = usePartageOptions(groups);
  return (partage) => options.find((o) => o.value === partage)?.label ?? t('shareGroup');
}

// La légende d'un rectangle (« Équipe », « Vous seul », le nom du groupe) et la promesse qui va avec, dans le panneau.
export function usePartageWords(groups: GroupOption[]) {
  const t = useTranslations('documents');
  const label = usePartageLabel(groups);
  return {
    caption: (partage: string) =>
      partage === 'equipe' ? t('captionTeam') : partage === 'moi' ? t('captionMe') : label(partage),
    // `count` : combien de fichiers la phrase couvre (« le » ou « les »)
    says: (partage: string, count: number) =>
      partage === 'equipe'
        ? t('sayTeam', { count })
        : partage === 'moi'
          ? t('sayMe', { count })
          : t('sayGroup', { group: label(partage), count }),
  };
}

const SAID_MS = 1600;

// L'auteur change qui voit un document, ou tous ceux d'un de ses dossiers : enregistré tout de suite, « Enregistré »
// dit sur place (et un refus aussi), comme le reste du panneau.
export function ShareSelect({
  share,
  value,
  groups,
  label,
  id,
  className,
}: {
  share: (partage: string) => Promise<{ ok: boolean }>;
  value: string;
  groups: GroupOption[];
  label: string;
  id?: string;
  className?: string;
}) {
  const t = useTranslations('documents');
  const options = usePartageOptions(groups);
  const [pending, startTransition] = useTransition();
  const [said, setSaid] = useState<'saved' | 'failed' | null>(null);
  useEffect(() => {
    if (said !== 'saved') return;
    const timer = setTimeout(() => setSaid(null), SAID_MS);
    return () => clearTimeout(timer);
  }, [said]);
  const change = (partage: string) =>
    startTransition(async () => {
      setSaid(null);
      try {
        const { ok } = await share(partage);
        setSaid(ok ? 'saved' : 'failed');
      } catch {
        setSaid('failed');
      }
    });
  return (
    <span className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      <Select
        id={id}
        aria-label={label}
        value={options.some((o) => o.value === value) ? value : undefined}
        placeholder={t('shareGroup')}
        onValueChange={change}
        disabled={pending}
        options={options}
        className="h-9 w-[220px] max-shell:w-full"
      />
      <span aria-live="polite" className="text-label">
        {said === 'saved' && <DoneMark>{t('saved')}</DoneMark>}
        {said === 'failed' && <span className="text-destructive">{t('shareFailed')}</span>}
      </span>
    </span>
  );
}
