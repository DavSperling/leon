'use client';

import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  type FormEvent,
  type ReactNode,
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { type PlacementInput, setLocaleAction } from '@/app/(app)/reglages/actions';
import {
  type AboutStepErrors,
  type AboutStepField,
  type AboutStepState,
  completeAboutStepAction,
} from '@/app/(onboarding)/bienvenue/actions';
import type { ProviderId } from '@/capture/turn';
import { Badge } from '@/components/verre/ui/badge';
import { Button } from '@/components/verre/ui/button';
import { Notice } from '@/components/verre/ui/feedback';
import { Field, Input } from '@/components/verre/ui/form';
import { Pill } from '@/components/verre/ui/pill';
import { GlassCard } from '@/components/verre/ui/surfaces';
import {
  COMPANY_SIZES,
  departmentLabelKey,
  GOALS,
  jobLabelKey,
  type OnboardingStepId,
  seniorityId,
} from '@/lib/onboarding';
import { nb } from '@/lib/verre/nb';
import type { Placement } from '@/server/auth/onboarding';
import { PlacementFields } from './placement-fields';
import { AboutPreview } from './preview';
import { OnboardingSteps } from './steps';

export type AboutStepProps = {
  /** newcomer : connecté sans espace (il nomme son entreprise) ; owner : crée l'espace ; member : invité, son poste est fixé par un administrateur. */
  mode: 'newcomer' | 'owner' | 'member';
  /** Le rôle dans l'espace, pour l'étiquette de l'aperçu (un administrateur existant s'y lit « Admin »). */
  spaceRole: 'owner' | 'admin' | 'member';
  userName: string;
  organizationName: string | null;
  /** Ce qu'un administrateur a fixé pour un membre. */
  placement: Placement | null;
  /** Les étapes que cette personne va parcourir ; une seule, et le fil d'étapes disparaît. */
  steps: OnboardingStepId[];
  /** Les outils que l'étape Vos outils propose (`onboardingReady`) : l'aperçu n'annonce qu'eux. */
  readyTools: ProviderId[];
};

// Le trait d'union des tailles ('11-50') s'écrit en tiret demi-cadratin ; la valeur envoyée reste l'identifiant.
const sizeLabel = (size: string) => size.replace('-', '–');

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
  steps,
  readyTools,
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

  // Les erreurs sont des codes, traduits au rendu (un changement de langue les suit). La copie locale se remet à
  // l'état de l'action à chaque réponse, et perd l'erreur d'un champ dès que sa valeur change. La remise à zéro se
  // fait pendant le rendu, non dans l'effet : le focus ci-dessous lit `aria-invalid` dans le DOM déjà à jour.
  const [seenState, setSeenState] = useState(state);
  const [errors, setErrors] = useState<AboutStepErrors>(state.errors ?? {});
  if (state !== seenState) {
    setSeenState(state);
    setErrors(state.errors ?? {});
  }
  const clearErrors = (...fields: AboutStepField[]) =>
    setErrors((current) => {
      const next = { ...current };
      for (const field of fields) delete next[field];
      return next;
    });
  const errorOf = (field: AboutStepField) => {
    const code = errors[field];
    return code ? t(`errors.${code}`) : undefined;
  };

  // Les choix vivent ici : l'aperçu les suit sans envoi, et ils résistent à un refus et au changement de langue.
  // Les champs cachés envoient les mêmes valeurs.
  const [company, setCompany] = useState('');
  const [chosen, setChosen] = useState<PlacementInput>({ department: '', job: '', seniority: '' });
  const { department, job, seniority } = chosen;
  const [size, setSize] = useState('');
  const [goals, setGoals] = useState<string[]>([]);

  // Après un refus : le focus va au premier champ en erreur (le déclencheur d'une liste, la première pastille d'un groupe).
  useEffect(() => {
    if (state.errors)
      formRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]')
        ?.focus();
  }, [state]);

  // Pas de `action={formAction}` : React remet le formulaire à zéro après une action, et les listes (Radix Select)
  // se vident avec lui. On envoie donc nous-mêmes, dans une transition, ce qui garde aussi `pending`.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  };

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
  // L'aperçu montre ce qui est choisi (propriétaire, nouveau venu) ou ce qu'un administrateur a fixé (membre).
  const shown: Placement =
    mode === 'member'
      ? (placement ?? { department: null, job: null, seniority: null })
      : { department, job, seniority: seniority === '' ? null : Number(seniority) };
  const fixedLevel = seniorityId(placement?.seniority ?? null);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:gap-10">
      <form ref={formRef} noValidate onSubmit={submit} className="grid content-start gap-5">
        <OnboardingSteps steps={steps} current="about" />
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
          <Field label={t('company')} error={errorOf('organizationName')}>
            <Input
              name="organizationName"
              autoComplete="organization"
              value={company}
              onChange={(event) => {
                setCompany(event.target.value);
                clearErrors('organizationName');
              }}
            />
          </Field>
        )}

        {editable && (
          <>
            <PlacementFields
              value={chosen}
              onChange={(next, field) => {
                setChosen(next);
                clearErrors(field);
                if (field === 'department') clearErrors('job');
              }}
              errors={{
                department: errorOf('department'),
                job: errorOf('job'),
                seniority: errorOf('seniority'),
              }}
            />

            <Group legend={t('size')} error={errorOf('size')}>
              {COMPANY_SIZES.map((option, i) => (
                <Pill
                  key={option}
                  variant={size === option ? 'active' : 'default'}
                  aria-pressed={size === option}
                  data-invalid={errors.size && i === 0 ? 'true' : undefined}
                  onClick={() => {
                    setSize(option);
                    clearErrors('size');
                  }}
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
            {errorOf('form')}
          </Notice>
        )}

        <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
          {steps.length <= 1 ? t('teammates.enter') : t('continue')}
        </Button>
      </form>

      <AboutPreview
        organization={orgName || null}
        userName={userName}
        role={spaceRole}
        department={shown.department ?? ''}
        job={shown.job ?? ''}
        seniority={shown.seniority}
        readyTools={readyTools}
      />
    </div>
  );
}
