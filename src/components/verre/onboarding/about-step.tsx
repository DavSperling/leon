'use client';

import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { setLocaleAction } from '@/app/(app)/reglages/actions';
import { type AboutStepState, completeAboutStepAction } from '@/app/(onboarding)/bienvenue/actions';
import { Badge } from '@/components/verre/ui/badge';
import { Button } from '@/components/verre/ui/button';
import { Notice } from '@/components/verre/ui/feedback';
import { Field, Input, Select } from '@/components/verre/ui/form';
import { Pill } from '@/components/verre/ui/pill';
import { GlassCard } from '@/components/verre/ui/surfaces';
import {
  COMPANY_SIZES,
  DEPARTMENT_IDS,
  DEPARTMENTS,
  departmentLabelKey,
  GOALS,
  isDepartment,
  jobLabelKey,
  SENIORITY_LEVELS,
  seniorityId,
} from '@/lib/onboarding';
import { nb } from '@/lib/verre/nb';
import type { Placement } from '@/server/auth/onboarding';
import { AboutPreview } from './preview';

export type AboutStepProps = {
  /** newcomer : connecté sans espace (il nomme son entreprise) ; owner : crée l'espace ; member : invité, son poste est fixé par un administrateur. */
  mode: 'newcomer' | 'owner' | 'member';
  /** Le rôle dans l'espace, pour l'étiquette de l'aperçu (un administrateur existant s'y lit « Admin »). */
  spaceRole: 'owner' | 'admin' | 'member';
  userName: string;
  organizationName: string | null;
  /** Ce qu'un administrateur a fixé pour un membre. */
  placement: Placement | null;
};

// Le trait d'union des tailles ('11-50') s'écrit en tiret demi-cadratin ; la valeur envoyée reste l'identifiant.
const sizeLabel = (size: string) => size.replace('-', '–');
// La valeur d'un champ, rendue par l'action après un refus.
const textOf = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '');
// Le départ du select du niveau : la valeur gardée en base (indice + 1).
const levelOptions = SENIORITY_LEVELS.map((id, i) => ({ id, value: String(i + 1) }));

function Group({
  legend,
  hint,
  error,
  children,
}: {
  legend: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-label font-semibold text-fg-2">
        {legend}
        {hint && <span className="ml-2 font-normal text-muted">{hint}</span>}
      </legend>
      <div className="flex flex-wrap gap-2">{children}</div>
      {error && (
        <p role="alert" className="mt-1.5 text-label text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function AboutStep({
  mode,
  spaceRole,
  userName,
  organizationName,
  placement,
}: AboutStepProps) {
  const t = useTranslations('onboarding');
  const languages = useTranslations('preferences');
  const locale = useLocale();
  const router = useRouter();
  const [, switchLocale] = useTransition();
  const [state, formAction, pending] = useActionState<AboutStepState, FormData>(
    completeAboutStepAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state.errors ?? {};

  // Les choix vivent ici : l'aperçu les suit sans envoi, et ils résistent à un refus et au changement de langue.
  // Les champs cachés envoient les mêmes valeurs ; `state.values` ne sert qu'à un formulaire arrivé du serveur.
  const values = state.values ?? {};
  const [company, setCompany] = useState(textOf(values.organizationName));
  const [department, setDepartment] = useState(textOf(values.department));
  const [job, setJob] = useState(textOf(values.job));
  const [seniority, setSeniority] = useState(textOf(values.seniority));
  const [size, setSize] = useState(textOf(values.size));
  const [goals, setGoals] = useState<string[]>(Array.isArray(values.goals) ? values.goals : []);

  // Après un refus : le focus va au premier champ en erreur (le déclencheur d'une liste, la première pastille d'un groupe).
  useEffect(() => {
    if (state.errors)
      formRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]')
        ?.focus();
  }, [state]);

  const chooseLanguage = (next: string) => {
    if (next === locale) return;
    const data = new FormData();
    data.set('locale', next);
    switchLocale(async () => {
      await setLocaleAction(data);
      router.refresh();
    });
  };

  const editable = mode !== 'member';
  const orgName = mode === 'newcomer' ? company.trim() : (organizationName ?? '');
  const jobs: readonly string[] = isDepartment(department) ? DEPARTMENTS[department].jobs : [];
  // L'aperçu montre ce qui est choisi (propriétaire, nouveau venu) ou ce qu'un administrateur a fixé (membre).
  const shown: Placement =
    mode === 'member'
      ? (placement ?? { department: null, job: null, seniority: null })
      : { department, job, seniority: seniority === '' ? null : Number(seniority) };
  const fixedLevel = seniorityId(placement?.seniority ?? null);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:gap-10">
      <form ref={formRef} noValidate action={formAction} className="grid content-start gap-5">
        <div>
          <h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">
            {mode === 'member' ? t('memberTitle', { organization: orgName }) : t('title')}
          </h1>
          <p className="mt-2 text-body text-muted">{nb(t('lead'))}</p>
        </div>

        <Group legend={t('language')}>
          {(['en', 'fr'] as const).map((code) => (
            <Pill
              key={code}
              lang={code}
              variant={locale === code ? 'active' : 'default'}
              aria-pressed={locale === code}
              onClick={() => chooseLanguage(code)}
            >
              {languages(code === 'en' ? 'english' : 'french')}
            </Pill>
          ))}
        </Group>

        {mode === 'newcomer' && (
          <Field label={t('company')} error={errors.organizationName}>
            <Input
              name="organizationName"
              autoComplete="organization"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
            />
          </Field>
        )}

        {editable && (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
              <Field label={t('department')} error={errors.department}>
                <Select
                  className="[&>span:first-child]:min-w-0 [&>span:first-child]:truncate"
                  placeholder={t('choose')}
                  value={department}
                  onValueChange={(next) => {
                    setDepartment(next);
                    setJob('');
                  }}
                  options={DEPARTMENT_IDS.map((id) => ({
                    value: id,
                    label: t(departmentLabelKey(id)),
                  }))}
                />
              </Field>
              <Field label={t('job')} error={errors.job}>
                <Select
                  className="[&>span:first-child]:min-w-0 [&>span:first-child]:truncate"
                  placeholder={t('choose')}
                  disabled={jobs.length === 0}
                  value={job}
                  onValueChange={setJob}
                  options={jobs.map((id) => ({
                    value: id,
                    label: t(jobLabelKey(department, id)),
                  }))}
                />
              </Field>
            </div>

            <Field label={t('seniorityLabel')} help={t('seniorityHint')} error={errors.seniority}>
              <Select
                placeholder={t('choose')}
                value={seniority}
                onValueChange={setSeniority}
                options={levelOptions.map(({ id, value }) => ({
                  value,
                  label: t(`seniority.${id}`),
                }))}
              />
            </Field>

            <Group legend={t('size')} error={errors.size}>
              {COMPANY_SIZES.map((option, i) => (
                <Pill
                  key={option}
                  variant={size === option ? 'active' : 'default'}
                  aria-pressed={size === option}
                  data-invalid={errors.size && i === 0 ? 'true' : undefined}
                  onClick={() => setSize(option)}
                >
                  {sizeLabel(option)}
                </Pill>
              ))}
            </Group>

            <input type="hidden" name="department" value={department} />
            <input type="hidden" name="job" value={job} />
            <input type="hidden" name="seniority" value={seniority} />
            <input type="hidden" name="size" value={size} />
          </>
        )}

        {mode === 'member' && (
          <GlassCard className="p-4">
            {placement && (placement.department || placement.job || fixedLevel) ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {placement.job && (
                  <p className="text-body font-semibold text-fg">
                    {t(jobLabelKey(placement.department, placement.job))}
                  </p>
                )}
                {fixedLevel && <Badge tone="accent">{t(`seniority.${fixedLevel}`)}</Badge>}
                {placement.department && (
                  <Badge>{t(departmentLabelKey(placement.department))}</Badge>
                )}
              </div>
            ) : (
              <p className="text-body text-fg-2">{t('notSet')}</p>
            )}
            <p className="mt-3 flex items-start gap-2 text-label text-muted">
              <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.8} />
              {nb(t('locked', { organization: orgName }))}
            </p>
          </GlassCard>
        )}

        <Group legend={t('goalsLabel')} hint={t('goalsHint')}>
          {GOALS.map((goal) => {
            const on = goals.includes(goal);
            return (
              <Pill
                key={goal}
                variant={on ? 'active' : 'default'}
                aria-pressed={on}
                onClick={() =>
                  setGoals(on ? goals.filter((other) => other !== goal) : [...goals, goal])
                }
              >
                {t(`goals.${goal}`)}
              </Pill>
            );
          })}
        </Group>
        {goals.map((goal) => (
          <input key={goal} type="hidden" name="goals" value={goal} />
        ))}

        {errors.form && (
          <Notice tone="error" live="alert">
            {errors.form}
          </Notice>
        )}

        <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
          {t('continue')}
        </Button>
      </form>

      <AboutPreview
        organization={orgName || null}
        userName={userName}
        role={spaceRole}
        department={shown.department ?? ''}
        job={shown.job ?? ''}
        seniority={shown.seniority}
      />
    </div>
  );
}
