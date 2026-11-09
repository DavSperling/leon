'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Select, type SelectOption, toast } from '@/components/verre';
import { departmentLabelKey } from '@/lib/onboarding';

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

// L'auteur change qui voit un document, tous ceux d'un de ses dossiers, ou ce qu'une de ses connexions relève.
export function ShareSelect({
  share,
  value,
  groups,
  label,
}: {
  share: (partage: string) => Promise<{ ok: boolean }>;
  value: string;
  groups: GroupOption[];
  label: string;
}) {
  const t = useTranslations('documents');
  const options = usePartageOptions(groups);
  const [pending, startTransition] = useTransition();
  const change = (partage: string) =>
    startTransition(async () => {
      try {
        const { ok } = await share(partage);
        if (ok) toast.success(t('shareSaved'));
        else toast.error(t('shareFailed'));
      } catch {
        toast.error(t('shareFailed'));
      }
    });
  return (
    <Select
      aria-label={label}
      value={options.some((o) => o.value === value) ? value : undefined}
      placeholder={t('shareGroup')}
      onValueChange={change}
      disabled={pending}
      options={options}
      className="w-40 shrink-0"
    />
  );
}
