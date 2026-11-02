'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { InviteErrors, PlacementInput } from '@/app/(app)/reglages/actions';
import { Field, Select } from '@/components/verre/ui/form';
import {
  DEPARTMENT_IDS,
  DEPARTMENTS,
  departmentLabelKey,
  isDepartment,
  jobLabelKey,
  SENIORITY_LEVELS,
} from '@/lib/onboarding';

export type PlacementField = 'department' | 'job' | 'seniority';

// Le départ du select du niveau : la valeur gardée en base (indice + 1).
const levelOptions = SENIORITY_LEVELS.map((id, i) => ({ id, value: String(i + 1) }));

/**
 * Service, poste et niveau : les trois listes de l'étape 1 de l'onboarding, partagées avec l'invitation et la
 * modification du poste d'un membre. L'état est à l'appelant ; un changement de service vide le poste. `errors` reçoit
 * des textes déjà traduits.
 */
export function PlacementFields({
  value,
  onChange,
  errors = {},
}: {
  value: PlacementInput;
  onChange: (next: PlacementInput, field: PlacementField) => void;
  errors?: Partial<Record<PlacementField, string | undefined>>;
}) {
  const t = useTranslations('onboarding');
  const { department, job, seniority } = value;
  const jobs: readonly string[] = isDepartment(department) ? DEPARTMENTS[department].jobs : [];

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
        <Field label={t('department')} error={errors.department}>
          <Select
            className="[&>span:first-child]:min-w-0 [&>span:first-child]:truncate"
            placeholder={t('choose')}
            value={department}
            onValueChange={(next) =>
              onChange({ ...value, department: next, job: '' }, 'department')
            }
            options={DEPARTMENT_IDS.map((id) => ({ value: id, label: t(departmentLabelKey(id)) }))}
          />
        </Field>
        <Field label={t('job')} error={errors.job}>
          <Select
            className="[&>span:first-child]:min-w-0 [&>span:first-child]:truncate"
            placeholder={t('choose')}
            disabled={jobs.length === 0}
            value={job}
            onValueChange={(next) => onChange({ ...value, job: next }, 'job')}
            options={jobs.map((id) => ({ value: id, label: t(jobLabelKey(department, id)) }))}
          />
        </Field>
      </div>

      <Field label={t('seniorityLabel')} help={t('seniorityHint')} error={errors.seniority}>
        <Select
          placeholder={t('choose')}
          value={seniority}
          onValueChange={(next) => onChange({ ...value, seniority: next }, 'seniority')}
          options={levelOptions.map((level) => ({
            value: level.value,
            label: t(`seniority.${level.id}`),
          }))}
        />
      </Field>
    </>
  );
}

/**
 * L'état d'un formulaire de poste (invitation, modification d'un membre) : les choix, les codes d'erreur rendus par
 * l'action (traduits au rendu, donc un changement de langue les suit) et le focus sur le premier champ fautif.
 * `fields` se déverse dans `PlacementFields`.
 */
export function usePlacementForm(
  initial: PlacementInput = { department: '', job: '', seniority: '' },
) {
  const t = useTranslations('onboarding.inviteErrors');
  const formRef = useRef<HTMLFormElement>(null);
  const [placement, setPlacement] = useState(initial);
  const [errors, setErrors] = useState<InviteErrors>({});

  const clear = (...fields: (keyof InviteErrors)[]) =>
    setErrors((current) => {
      const next = { ...current };
      for (const field of fields) delete next[field];
      return next;
    });
  const text = (field: keyof InviteErrors) => {
    const code = errors[field];
    return code ? t(code) : undefined;
  };

  return {
    formRef,
    placement,
    clear,
    text,
    fields: {
      value: placement,
      // Le service vidé emporte l'erreur du poste avec lui.
      onChange: (next: PlacementInput, field: PlacementField) => {
        setPlacement(next);
        clear(field, ...(field === 'department' ? (['job'] as const) : []));
      },
      errors: { department: text('department'), job: text('job'), seniority: text('seniority') },
    },
    // Affiche les erreurs d'une réponse refusée, puis met le focus sur le premier champ en erreur (lu dans le DOM à jour).
    reject: (next: InviteErrors) => {
      flushSync(() => setErrors(next));
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    },
  };
}
