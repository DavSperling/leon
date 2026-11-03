'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { initialOf } from '@/components/verre/shell/brand';
import { Badge } from '@/components/verre/ui/badge';
import { ToolIcon } from '@/components/verre/ui/chips';
import { GlassCard } from '@/components/verre/ui/surfaces';
import {
  DEPARTMENTS,
  departmentLabelKey,
  isDepartment,
  jobLabelKey,
  seniorityId,
} from '@/lib/onboarding';
import { PROVIDER_LABELS } from '@/lib/providers';

export type AboutPreviewProps = {
  /** Le nom de l'espace ; null tant qu'un nouveau venu n'a pas saisi celui de son entreprise. */
  organization: string | null;
  userName: string;
  role: 'owner' | 'admin' | 'member';
  /** Ce qui est choisi à l'écran ("" tant que rien ne l'est) ; un identifiant inconnu se lit « Autre ». */
  department: string;
  job: string;
  seniority: number | null;
};

export function PreviewCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <GlassCard className="p-4">
      <h2 className="mb-3 text-meta font-medium tracking-[0.05em] text-muted uppercase">{title}</h2>
      {children}
    </GlassCard>
  );
}

/** Ce que Leon fera de ces réponses, qui suit les choix sans rien envoyer : la fiche, les outils proposés, deux questions pour le Chat. */
export function AboutPreview({
  organization,
  userName,
  role,
  department,
  job,
  seniority,
}: AboutPreviewProps) {
  const t = useTranslations('onboarding');
  const level = seniorityId(seniority);
  // Les outils et les exemples n'existent que pour un service de la liste.
  const listed = isDepartment(department) ? department : null;
  // Tant que rien n'est choisi, la fiche ne montre que le nom.
  const chosen = department !== '' || job !== '' || level !== null;
  return (
    <div className="grid content-center gap-4 rounded-box border border-line bg-glass p-4 sm:p-6">
      <PreviewCard
        title={
          organization === null ? t('preview.profile') : t('preview.profileIn', { organization })
        }
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-field border border-accent-line bg-accent-soft font-bold text-accent"
          >
            {initialOf(userName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-title font-semibold text-fg">{userName}</p>
            {job !== '' && (
              <p className="truncate text-ui text-fg-2">
                {t(jobLabelKey(department || null, job))}
              </p>
            )}
          </div>
        </div>
        {chosen && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {level !== null && <Badge tone="accent">{t(`seniority.${level}`)}</Badge>}
            {department !== '' && <Badge>{t(departmentLabelKey(department))}</Badge>}
            <Badge>{t(`preview.${role}`)}</Badge>
          </div>
        )}
      </PreviewCard>

      {listed && (
        <>
          <PreviewCard title={t('preview.connect')}>
            <ul className="flex flex-wrap gap-2">
              {DEPARTMENTS[listed].tools.map((tool) => (
                <li key={tool} title={PROVIDER_LABELS[tool]}>
                  <ToolIcon kind={tool} boxed />
                  <span className="sr-only">{PROVIDER_LABELS[tool]}</span>
                </li>
              ))}
            </ul>
          </PreviewCard>
          <PreviewCard title={t('preview.ask')}>
            <ul className="grid gap-2">
              <li className="border-l-2 border-accent-line py-0.5 pl-2.5 text-ui text-fg-2">
                {t(`asks.${listed}.one`)}
              </li>
              <li className="border-l-2 border-accent-line py-0.5 pl-2.5 text-ui text-fg-2">
                {t(`asks.${listed}.two`)}
              </li>
            </ul>
          </PreviewCard>
        </>
      )}

      <p className="mt-2 text-center text-h2 font-semibold tracking-[-0.018em] text-fg-2">
        {t('preview.settingUp')}
      </p>
    </div>
  );
}
