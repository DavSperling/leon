'use client';

import { AnimatePresence, motion, useAnimate } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import {
  type AuthFormState,
  joinAction,
  signInAction,
  signUpAction,
  verifyTwoFactorAction,
} from '@/app/(auth)/actions';
import { Button } from '@/components/verre/ui/button';
import { Notice } from '@/components/verre/ui/feedback';
import { Field, Input } from '@/components/verre/ui/form';
import { isInstant } from '@/lib/verre/instant';
import { enter, exit } from '@/lib/verre/motion';
import { nb } from '@/lib/verre/nb';

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

const FIELDS: Record<AuthPage, FieldDef[]> = {
  connexion: [
    { name: 'email', label: 'email', type: 'email', autoComplete: 'email' },
    { name: 'password', label: 'password', type: 'password', autoComplete: 'current-password' },
  ],
  inscription: [
    { name: 'name', label: 'name', type: 'text', autoComplete: 'name' },
    { name: 'email', label: 'email', type: 'email', autoComplete: 'email' },
    // pas d'aide « 8 caractères minimum » : la ligne d'état sous le champ le dit déjà
    { name: 'password', label: 'password', type: 'password', autoComplete: 'new-password' },
    {
      name: 'confirmation',
      label: 'confirmPassword',
      type: 'password',
      autoComplete: 'new-password',
    },
    {
      name: 'organizationName',
      label: 'companyName',
      type: 'text',
      autoComplete: 'organization',
      hint: 'companyHint',
    },
  ],
  // Un compte existant ne rejoint pas l'espace : il appartient déjà à une autre organisation.
  invitation: [
    { name: 'name', label: 'name', type: 'text', autoComplete: 'name' },
    {
      name: 'email',
      label: 'email',
      type: 'email',
      autoComplete: 'email',
      hint: 'inviteEmailHint',
    },
    { name: 'password', label: 'password', type: 'password', autoComplete: 'new-password' },
    {
      name: 'confirmation',
      label: 'confirmPassword',
      type: 'password',
      autoComplete: 'new-password',
    },
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

// Un avis qui s'ouvre pousse le bouton et le pied vers le bas : ils glissent (transform) au lieu de sauter.
const slide = { layout: 'position', transition: { layout: enter } } as const;
const noticeIn = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0, transition: enter },
  exit: { opacity: 0, transition: exit },
};
// Champ en erreur et focalisé : l'anneau de focus du système revient (la bordure rouge seule ne change pas) ;
// 16,5 px sur écran tactile, sinon iOS zoome la page au premier toucher.
const CONTROL_FIX = 'pointer-coarse:text-title aria-invalid:focus-visible:outline-solid';

// `invitation` : le secret du lien, renvoyé dans un champ caché, et le nom de l'espace à rejoindre.
// `canResetPassword` : « Mot de passe oublié ? » n'apparaît que si Leon peut envoyer l'e-mail.
// `returnTo` : où revenir après la connexion (l'autorisation d'un ordinateur) ; renvoyé dans un champ caché, que
// signInAction et verifyTwoFactorAction revalident.
export function AuthForm({
  page,
  invitation,
  canResetPassword = false,
  returnTo,
}: {
  page: AuthPage;
  invitation?: { token: string; organizationName: string };
  canResetPassword?: boolean;
  returnTo?: string;
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
  const [pwScope, animate] = useAnimate<HTMLDivElement>();
  const errors = state.errors ?? {};
  const [twoFactorState, twoFactorAction, twoFactorPending] = useActionState<
    AuthFormState,
    FormData
  >(verifyTwoFactorAction, { twoFactor: true });

  // Messages de app/(auth)/actions.ts qui changent le rendu : secousse du mot de passe, lien « Se connecter ».
  const wrong = t('wrongCredentials');
  const signedUpNotIn = t('signedUpNotIn');

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

  // Inscription avec vérification d'e-mail : le lien est parti (actions.ts), on confirme au lieu du formulaire.
  if (state.message) {
    return (
      <div className="fade-in">
        <h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">{t(copy.title)}</h1>
        <Notice tone="success" live="status" className="mt-6">
          {state.message}
        </Notice>
        {copy.footer && copy.href && (
          <p className="mt-6 border-t border-line pt-5 text-ui text-muted">
            {nb(t(copy.footer))}{' '}
            <Link
              href={copy.href}
              className="rounded-sm font-semibold text-accent underline decoration-accent-line underline-offset-4 transition-colors hover:decoration-accent"
            >
              {t(copy.other)}
            </Link>
          </p>
        )}
      </div>
    );
  }

  return (
    // Passage connexion ↔ inscription : la carte reste (mise en page commune), le contenu entre en fondu (CSS : visible
    // sans JavaScript, le rendu serveur n'attend pas l'hydratation).
    <div className="fade-in">
      <h1 id={titleId} className="text-h1 font-semibold tracking-[-0.025em] text-fg">
        {t(copy.title)}
      </h1>
      {invitation && (
        <p className="mt-2 text-ui [overflow-wrap:anywhere] text-muted">
          {nb(t('invitedTo', { name: invitation.organizationName }))}
        </p>
      )}

      <form
        ref={formRef}
        aria-labelledby={titleId}
        // tous les champs sont obligatoires (required les signale) ; la validation reste celle du serveur
        noValidate
        action={state.twoFactor ? twoFactorAction : formAction}
        className="mt-6 grid gap-4"
      >
        {invitation && <input type="hidden" name="token" value={invitation.token} />}
        {returnTo && <input type="hidden" name="retour" value={returnTo} />}
        {state.twoFactor ? (
          <>
            <p className="text-ui text-muted">
              {backupCode ? t('twoFactorBackupPrompt') : t('twoFactorAppPrompt')}
            </p>
            <Field
              key={backupCode ? 'secours' : 'application'}
              label={backupCode ? t('backupCodeLabel') : t('authCodeLabel')}
              error={twoFactorState.errors?.code}
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
                className={CONTROL_FIX}
              />
            </Field>
            <button
              type="button"
              onClick={() => setBackupCode((value) => !value)}
              className="w-fit text-ui text-accent underline underline-offset-4"
            >
              {backupCode ? t('useApp') : t('lostPhone')}
            </button>
            {twoFactorState.errors?.form && (
              <Notice tone="error" live="alert">
                {twoFactorState.errors.form}
              </Notice>
            )}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={twoFactorPending}
              className="w-full"
            >
              {t('verify')}
            </Button>
          </>
        ) : (
          FIELDS[page].map((f, i) => {
            const isPw = f.type === 'password';
            const isSignup = page !== 'connexion';
            const isConfirmation = f.name === 'confirmation';
            return (
              <div key={f.name} ref={isPw && !isConfirmation ? pwScope : undefined}>
                <Field
                  label={t(f.label)}
                  help={f.hint && t(f.hint)}
                  error={errors[f.name]}
                  id={isPw && !isConfirmation ? pwId : undefined}
                >
                  {isConfirmation ? (
                    <Input
                      name={f.name}
                      type="password"
                      autoComplete={f.autoComplete}
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      required
                      className={CONTROL_FIX}
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
                        className={`pr-[84px] ${CONTROL_FIX}`}
                      />
                      <button
                        type="button"
                        aria-controls={pwId}
                        aria-label={visible ? t('hidePassword') : t('showPassword')}
                        onClick={() => setVisible((v) => !v)}
                        className="absolute inset-y-1 right-1 min-w-[68px] rounded-chip px-3 text-label font-semibold text-accent transition-colors duration-150 hover:bg-hover"
                      >
                        {visible ? t('hide') : t('show')}
                      </button>
                    </div>
                  ) : (
                    <Input
                      name={f.name}
                      type={f.type}
                      autoComplete={f.autoComplete}
                      defaultValue={state.values?.[f.name]}
                      // à l'arrivée, le premier champ reçoit le focus
                      autoFocus={i === 0}
                      required
                      className={CONTROL_FIX}
                      {...(f.type === 'email'
                        ? { inputMode: 'email', autoCapitalize: 'none', spellCheck: false }
                        : {})}
                    />
                  )}
                </Field>
                {isPw && isSignup && !isConfirmation && (
                  <p
                    aria-live="polite"
                    className={`mt-1.5 text-label ${password.length >= 8 ? 'text-success' : 'text-muted'}`}
                  >
                    {password.length >= 8 ? '✓' : '○'} {t('passwordMinLength')}
                  </p>
                )}
                {isConfirmation && confirmation.length > 0 && (
                  <p
                    className={`mt-1.5 text-label ${confirmation === password ? 'text-success' : 'text-muted'}`}
                  >
                    {confirmation === password ? '✓' : '○'} {t('passwordsMatch')}
                  </p>
                )}
              </div>
            );
          })
        )}

        {!state.twoFactor && (
          <AnimatePresence initial={false}>
            {errors.form && (
              <motion.div key={errors.form} {...noticeIn}>
                <Notice
                  tone="error"
                  live="alert"
                  action={
                    errors.form === signedUpNotIn ? (
                      <Button asChild size="sm">
                        <Link href="/connexion">{t('signIn')}</Link>
                      </Button>
                    ) : undefined
                  }
                >
                  {errors.form}
                </Notice>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        <span role="status" className="sr-only">
          {pending ? t('sending') : ''}
        </span>
        {!state.twoFactor && (
          <motion.div {...slide} className="pt-1">
            <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
              {pending ? t('sending') : t(copy.submit)}
            </Button>
          </motion.div>
        )}
      </form>

      {page === 'connexion' && canResetPassword && !state.twoFactor && (
        <Link
          href="/mot-de-passe-oublie"
          className="mt-4 inline-block text-ui text-accent underline underline-offset-4"
        >
          {t('forgotLink')}
        </Link>
      )}

      {copy.href && (
        <motion.p {...slide} className="mt-6 border-t border-line pt-5 text-ui text-muted">
          {nb(t(copy.footer))}{' '}
          <Link
            href={copy.href}
            className="rounded-sm font-semibold text-accent underline decoration-accent-line underline-offset-4 transition-colors hover:decoration-accent"
          >
            {t(copy.other)}
          </Link>
        </motion.p>
      )}
    </div>
  );
}
