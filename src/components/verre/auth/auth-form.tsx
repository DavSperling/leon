'use client';

import { Check } from 'lucide-react';
import { useAnimate } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, useActionState, useEffect, useId, useRef, useState } from 'react';
import {
  type AuthFormState,
  joinAction,
  signInAction,
  signUpAction,
  verifyTwoFactorAction,
} from '@/app/(auth)/actions';
import { Button } from '@/components/verre/ui/button';
import { Field, Input } from '@/components/verre/ui/form';
import { cn } from '@/lib/verre/cn';
import { isInstant } from '@/lib/verre/instant';
import { nb } from '@/lib/verre/nb';
import { AuthLink, AuthNote, AuthSheet, AuthTitle } from './frame';

// Formulaires de connexion et d'inscription (directe ou par un lien d'invitation) : les champs, les règles et les
// messages sont ceux de app/(auth)/actions.ts.

export type AuthPage = 'connexion' | 'inscription' | 'invitation';
// Les libellés sont des clés de messages/*.json (espace `auth`), traduites au rendu.
type Key = Parameters<ReturnType<typeof useTranslations<'auth'>>>[0];
type FieldDef = {
  name: string;
  label: Key;
  type: 'text' | 'email' | 'password';
  autoComplete: string;
  hint?: Key;
};

// L'ordre de l'écran ; une paire se pose sur deux colonnes (une seule sous 600 px).
const FIELDS: Record<AuthPage, (FieldDef | [FieldDef, FieldDef])[]> = {
  connexion: [
    { name: 'email', label: 'email', type: 'email', autoComplete: 'email' },
    { name: 'password', label: 'password', type: 'password', autoComplete: 'current-password' },
  ],
  // L'entreprise d'abord : c'est l'espace qu'on crée. Pas d'aide « 8 caractères minimum » : les deux marques le disent.
  inscription: [
    { name: 'organizationName', label: 'companyName', type: 'text', autoComplete: 'organization' },
    [
      { name: 'name', label: 'name', type: 'text', autoComplete: 'name' },
      { name: 'email', label: 'email', type: 'email', autoComplete: 'email' },
    ],
    [
      { name: 'password', label: 'password', type: 'password', autoComplete: 'new-password' },
      {
        name: 'confirmation',
        label: 'confirmPassword',
        type: 'password',
        autoComplete: 'new-password',
      },
    ],
  ],
  // Un compte existant ne rejoint pas l'espace : il appartient déjà à une autre organisation (la règle sous l'adresse).
  invitation: [
    { name: 'name', label: 'name', type: 'text', autoComplete: 'name' },
    {
      name: 'email',
      label: 'email',
      type: 'email',
      autoComplete: 'email',
      hint: 'inviteEmailHint',
    },
    [
      { name: 'password', label: 'password', type: 'password', autoComplete: 'new-password' },
      {
        name: 'confirmation',
        label: 'confirmPassword',
        type: 'password',
        autoComplete: 'new-password',
      },
    ],
  ],
};

const COPY = {
  connexion: {
    title: 'signIn',
    submit: 'signIn',
    footer: 'noAccount',
    other: 'createWorkspace',
    href: '/inscription',
    action: signInAction,
  },
  inscription: {
    title: 'createWorkspace',
    submit: 'createWorkspaceSubmit',
    footer: 'haveAccount',
    other: 'signIn',
    href: '/connexion',
    action: signUpAction,
  },
  // Pas de lien « Se connecter » : se connecter à un compte existant ne fait pas rejoindre l'espace.
  invitation: {
    title: 'joinWorkspace',
    submit: 'joinWorkspace',
    footer: null,
    other: null,
    href: null,
    action: joinAction,
  },
} as const;

// La porte est un cran plus grande que les lignes de l'appli : 40 px, comme les champs à côté (44 au doigt).
const DOOR = 'h-10 w-full max-shell:h-11';

// `invitation` : le secret du lien, renvoyé dans un champ caché, et le nom de l'espace à rejoindre.
// `canResetPassword` : « Mot de passe oublié ? » n'apparaît que si Leon peut envoyer l'e-mail.
// `returnTo` : où revenir après la connexion (l'autorisation d'un ordinateur, d'un assistant) ; renvoyé dans un champ
// caché, que signInAction et verifyTwoFactorAction revalident.
// `alternatives` : Google, Microsoft et le SSO (OtherSignIn), au-dessus des champs, cachés pendant l'étape du code.
// `notice` : un message de la page (compte supprimé, retour de Google), sous le titre.
export function AuthForm({
  page,
  invitation,
  canResetPassword = false,
  returnTo,
  alternatives,
  notice,
}: {
  page: AuthPage;
  invitation?: { token: string; organizationName: string };
  canResetPassword?: boolean;
  returnTo?: string;
  alternatives?: ReactNode;
  notice?: ReactNode;
}) {
  const t = useTranslations('auth');
  const copy = COPY[page];
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(copy.action, {});
  const [visible, setVisible] = useState(false);
  // Étape du code : le code de l'application, ou un code de secours si le téléphone est perdu.
  const [backupCode, setBackupCode] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const pwId = useId();
  const titleId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const [pwScope, animate] = useAnimate<HTMLDivElement>();
  const errors = state.errors ?? {};
  const [twoFactorState, twoFactorAction, twoFactorPending] = useActionState<
    AuthFormState,
    FormData
  >(verifyTwoFactorAction, { twoFactor: true });

  // Messages de app/(auth)/actions.ts qui changent le rendu : le refus des identifiants se dit sous le mot de passe
  // (qui tremble), « Se connecter » suit le compte créé mais pas connecté.
  const wrong = t('wrongCredentials');
  const signedUpNotIn = t('signedUpNotIn');
  const isSignup = page !== 'connexion';
  const formError = errors.form === wrong ? undefined : errors.form;

  // Après un refus : le focus va au premier champ en erreur ; sur identifiants refusés, au mot de passe (vidé), qui tremble.
  useEffect(() => {
    if (!state.errors) return;
    const form = formRef.current;
    if (state.errors.form === wrong) {
      form?.querySelector<HTMLElement>('[name="password"]')?.focus();
      if (pwScope.current && !isInstant())
        animate(
          pwScope.current,
          { x: [0, -7, 6, -4, 3, -1, 0] },
          { duration: 0.42, ease: 'easeOut' },
        );
    } else form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state, wrong, animate, pwScope]);

  // La vue « fait » prend le focus : un lecteur d'écran l'entend, le clavier repart de là.
  useEffect(() => {
    if (state.message) doneRef.current?.focus();
  }, [state.message]);

  // Inscription avec vérification d'e-mail : le lien est parti (actions.ts), la même feuille le dit à la place du formulaire.
  if (state.message) {
    return (
      <AuthSheet>
        <h1
          ref={doneRef}
          tabIndex={-1}
          className="text-h1 font-semibold tracking-[-0.02em] text-fg outline-none"
        >
          <span className="mark is-on">{t('checkEmailTitle')}</span>
        </h1>
        <p role="status" className="mt-3 text-title leading-[1.5] text-pretty text-fg">
          {nb(state.message)}
        </p>
        {copy.href && (
          <Button asChild className={cn(DOOR, 'mt-6')}>
            <Link href="/connexion">{t('signIn')}</Link>
          </Button>
        )}
      </AuthSheet>
    );
  }

  const field = (f: FieldDef, first: boolean) => {
    const isPw = f.type === 'password';
    const isConfirmation = f.name === 'confirmation';
    const error = f.name === 'password' && errors.form === wrong ? wrong : errors[f.name];
    return (
      <div key={f.name} ref={isPw && !isConfirmation ? pwScope : undefined} className="min-w-0">
        <Field
          label={t(f.label)}
          help={f.hint && t(f.hint)}
          error={error}
          id={isPw && !isConfirmation ? pwId : undefined}
          aside={
            page === 'connexion' && isPw && canResetPassword ? (
              <Link
                href="/mot-de-passe-oublie"
                className="rounded-sm text-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-fg hover:decoration-fg max-[899px]:-my-3 max-[899px]:inline-flex max-[899px]:min-h-11 max-[899px]:items-center"
              >
                {t('forgotLink')}
              </Link>
            ) : undefined
          }
        >
          {isConfirmation ? (
            <Input
              name={f.name}
              type="password"
              autoComplete={f.autoComplete}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
          ) : isPw ? (
            <div className="relative">
              <Input
                name={f.name}
                type={visible ? 'text' : 'password'}
                autoComplete={f.autoComplete}
                spellCheck={false}
                value={isSignup ? password : undefined}
                onChange={isSignup ? (event) => setPassword(event.target.value) : undefined}
                required
                className="pr-16"
              />
              <Button
                variant="quiet"
                size="xs"
                aria-controls={pwId}
                aria-label={visible ? t('hidePassword') : t('showPassword')}
                onClick={() => setVisible((v) => !v)}
                className="absolute top-1.5 right-1.5 max-shell:top-1 max-shell:right-1 max-shell:h-9"
              >
                {visible ? t('hide') : t('show')}
              </Button>
            </div>
          ) : (
            <Input
              name={f.name}
              type={f.type}
              autoComplete={f.autoComplete}
              defaultValue={state.values?.[f.name]}
              // à l'arrivée, le premier champ reçoit le focus
              autoFocus={first}
              required
              {...(f.type === 'email'
                ? { inputMode: 'email', autoCapitalize: 'none', spellCheck: false }
                : {})}
            />
          )}
        </Field>
      </div>
    );
  };

  // Ce que le produit vérifie pendant qu'on tape un nouveau mot de passe : deux marques qui se cochent. Un refus de
  // l'un des deux champs le dit une fois : elles se retirent.
  const rules = isSignup && !errors.password && !errors.confirmation && (
    <ul aria-live="polite" className="-mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-label text-muted">
      {(
        [
          ['passwordMinLength', password.length >= 8],
          ['passwordsMatch', password.length > 0 && confirmation === password],
        ] as const
      ).map(([key, ok]) => (
        <li
          key={key}
          className={cn(
            'inline-flex items-center gap-1.5 transition-colors duration-150',
            ok && 'text-success',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'grid size-4 place-items-center rounded-full border transition-colors duration-150',
              ok ? 'border-current bg-current' : 'border-line-strong',
            )}
          >
            <Check
              strokeWidth={3}
              className={cn('size-2.5 text-sheet transition-opacity', !ok && 'opacity-0')}
            />
          </span>
          {t(key)}
          {ok && <span className="sr-only"> ✓</span>}
        </li>
      ))}
    </ul>
  );

  return (
    <AuthSheet
      alt={
        copy.href &&
        !state.twoFactor && (
          <>
            {nb(t(copy.footer))} <AuthLink href={copy.href}>{t(copy.other)}</AuthLink>
          </>
        )
      }
    >
      <AuthTitle id={titleId}>{t(copy.title)}</AuthTitle>
      {invitation && (
        <p className="mt-2 text-ui [overflow-wrap:anywhere] text-muted">
          {nb(t('invitedTo', { name: invitation.organizationName }))}
        </p>
      )}
      {notice && !state.twoFactor && <div className="mt-4">{notice}</div>}
      {!state.twoFactor && alternatives && <div className="mt-6">{alternatives}</div>}

      <form
        ref={formRef}
        aria-labelledby={titleId}
        // tous les champs sont obligatoires (required les signale) ; la validation reste celle du serveur
        noValidate
        action={state.twoFactor ? twoFactorAction : formAction}
        className={cn('grid gap-4', alternatives && !state.twoFactor ? 'mt-0' : 'mt-6')}
      >
        {invitation && <input type="hidden" name="token" value={invitation.token} />}
        {returnTo && <input type="hidden" name="retour" value={returnTo} />}
        {state.twoFactor ? (
          <>
            <p className="text-ui text-pretty text-muted">
              {nb(backupCode ? t('twoFactorBackupPrompt') : t('twoFactorAppPrompt'))}
            </p>
            <Field
              key={backupCode ? 'secours' : 'application'}
              label={backupCode ? t('backupCodeLabel') : t('authCodeLabel')}
              error={twoFactorState.errors?.code ?? twoFactorState.errors?.form}
            >
              <Input
                name="code"
                inputMode={backupCode ? 'text' : 'numeric'}
                autoComplete={backupCode ? 'off' : 'one-time-code'}
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                maxLength={backupCode ? 11 : 6}
                required
              />
            </Field>
            <Button
              variant="link"
              onClick={() => setBackupCode((value) => !value)}
              className="-mt-1 w-fit text-label text-muted hover:text-fg"
            >
              {backupCode ? t('useApp') : t('lostPhone')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={twoFactorPending}
              loadingLabel={t('sending')}
              className={cn(DOOR, 'mt-2')}
            >
              {t('verify')}
            </Button>
          </>
        ) : (
          <>
            {FIELDS[page].map((entry, i) =>
              Array.isArray(entry) ? (
                <div
                  key={entry[0].name}
                  className="grid grid-cols-2 gap-x-3 gap-y-4 max-[599px]:grid-cols-[minmax(0,1fr)]"
                >
                  {entry.map((f, j) => field(f, i === 0 && j === 0))}
                </div>
              ) : (
                field(entry, i === 0)
              ),
            )}
            {rules}
            {formError && (
              <div className="grid justify-items-start gap-2">
                <AuthNote tone="error">{formError}</AuthNote>
                {formError === signedUpNotIn && (
                  <Button asChild size="xs" className="ml-4">
                    <Link href="/connexion">{t('signIn')}</Link>
                  </Button>
                )}
              </div>
            )}
            <Button
              type="submit"
              variant="primary"
              loading={pending}
              loadingLabel={t('sending')}
              className={cn(DOOR, 'mt-2')}
            >
              {t(copy.submit)}
            </Button>
          </>
        )}
        <span role="status" className="sr-only">
          {pending || twoFactorPending ? t('sending') : ''}
        </span>
      </form>
    </AuthSheet>
  );
}
