'use client';

import { AnimatePresence, motion, useAnimate } from 'motion/react';
import Link from 'next/link';
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
import { enter, exit } from '@/lib/verre/motion';
import { nb } from '@/lib/verre/nb';

// Formulaires de connexion et d'inscription (directe ou par un lien d'invitation) : les champs, les règles et les
// messages sont ceux de app/(auth)/actions.ts.

export type AuthPage = 'connexion' | 'inscription' | 'invitation';
type FieldDef = {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password';
  autoComplete: string;
  hint?: string;
};

const FIELDS: Record<AuthPage, FieldDef[]> = {
  connexion: [
    { name: 'email', label: 'E-mail', type: 'email', autoComplete: 'email' },
    { name: 'password', label: 'Mot de passe', type: 'password', autoComplete: 'current-password' },
  ],
  inscription: [
    { name: 'name', label: 'Nom', type: 'text', autoComplete: 'name' },
    { name: 'email', label: 'E-mail', type: 'email', autoComplete: 'email' },
    {
      name: 'password',
      label: 'Mot de passe',
      type: 'password',
      autoComplete: 'new-password',
      hint: '8 caractères minimum.',
    },
    {
      name: 'confirmation',
      label: 'Confirmer le mot de passe',
      type: 'password',
      autoComplete: 'new-password',
    },
    {
      name: 'organizationName',
      label: 'Nom de l’entreprise',
      type: 'text',
      autoComplete: 'organization',
      hint: 'Crée l’espace de votre équipe.',
    },
  ],
  // Un compte existant ne rejoint pas l'espace : il appartient déjà à une autre organisation.
  invitation: [
    { name: 'name', label: 'Nom', type: 'text', autoComplete: 'name' },
    {
      name: 'email',
      label: 'E-mail',
      type: 'email',
      autoComplete: 'email',
      hint: 'Une adresse qui n’a pas encore de compte Leon.',
    },
    {
      name: 'password',
      label: 'Mot de passe',
      type: 'password',
      autoComplete: 'new-password',
      hint: '8 caractères minimum.',
    },
    {
      name: 'confirmation',
      label: 'Confirmer le mot de passe',
      type: 'password',
      autoComplete: 'new-password',
    },
  ],
};

const COPY = {
  connexion: {
    title: 'Se connecter',
    submit: 'Se connecter',
    footer: 'Pas encore de compte ?',
    other: 'Créer un espace',
    href: '/inscription',
    action: signInAction,
  },
  inscription: {
    title: 'Créer un espace',
    submit: 'Créer l’espace',
    footer: 'Déjà un compte ?',
    other: 'Se connecter',
    href: '/connexion',
    action: signUpAction,
  },
  // Pas de lien « Se connecter » : se connecter à un compte existant ne fait pas rejoindre l'espace.
  invitation: {
    title: 'Rejoindre l’espace',
    submit: 'Rejoindre l’espace',
    footer: null,
    other: null,
    href: null,
    action: joinAction,
  },
} as const;

// Messages de app/(auth)/actions.ts qui changent le rendu : secousse du mot de passe, lien « Se connecter ».
const WRONG = 'E-mail ou mot de passe incorrect.';
const SIGNED_UP_NOT_IN = 'Compte créé, mais la connexion a échoué. Connectez-vous.';

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
export function AuthForm({
  page,
  invitation,
}: {
  page: AuthPage;
  invitation?: { token: string; organizationName: string };
}) {
  const copy = COPY[page];
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(copy.action, {});
  const [visible, setVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const pwId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [pwScope, animate] = useAnimate<HTMLDivElement>();
  const errors = state.errors ?? {};
  const [twoFactorState, twoFactorAction, twoFactorPending] = useActionState<
    AuthFormState,
    FormData
  >(verifyTwoFactorAction, { twoFactor: true });

  // Après un refus : le focus va au premier champ en erreur ; sur identifiants refusés, au mot de passe (vidé), qui tremble.
  useEffect(() => {
    if (!state.errors) return;
    const form = formRef.current;
    if (state.errors.form === WRONG) {
      form?.querySelector<HTMLElement>('[name="password"]')?.focus();
      if (pwScope.current)
        animate(
          pwScope.current,
          { x: [0, -7, 6, -4, 3, -1, 0] },
          { duration: 0.42, ease: 'easeOut' },
        );
    } else form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state, animate, pwScope]);

  return (
    // Passage connexion ↔ inscription : la carte reste (mise en page commune), le contenu entre en fondu (CSS : visible
    // sans JavaScript, le rendu serveur n'attend pas l'hydratation).
    <div className="fade-in">
      <h1 className="text-h1 font-semibold tracking-[-0.025em] text-fg">{copy.title}</h1>
      {invitation && (
        <p className="mt-2 text-ui [overflow-wrap:anywhere] text-muted">
          On vous invite dans l’espace {nb(`« ${invitation.organizationName} »`)}.
        </p>
      )}

      <form
        ref={formRef}
        noValidate
        action={state.twoFactor ? twoFactorAction : formAction}
        className="mt-6 grid gap-4"
      >
        {invitation && <input type="hidden" name="token" value={invitation.token} />}
        {state.twoFactor ? (
          <>
            <p className="text-ui text-muted">
              Saisissez le code de votre application d’authentification.
            </p>
            <Field label="Code d’authentification" error={twoFactorState.errors?.code}>
              <Input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
              />
            </Field>
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
              Vérifier
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
                  label={f.label}
                  help={f.hint}
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
                        className={`pr-[84px] ${CONTROL_FIX}`}
                      />
                      <button
                        type="button"
                        aria-controls={pwId}
                        aria-label={visible ? 'Masquer le mot de passe' : 'Voir le mot de passe'}
                        onClick={() => setVisible((v) => !v)}
                        className="absolute inset-y-1 right-1 min-w-[68px] rounded-chip px-3 text-label font-semibold text-accent transition-colors duration-150 hover:bg-hover"
                      >
                        {visible ? 'Masquer' : 'Voir'}
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
                      className={CONTROL_FIX}
                      {...(f.type === 'email'
                        ? { inputMode: 'email', autoCapitalize: 'none', spellCheck: false }
                        : {})}
                    />
                  )}
                </Field>
                {isPw && isSignup && !isConfirmation && (
                  <p
                    className={`mt-1.5 text-label ${password.length >= 8 ? 'text-success' : 'text-muted'}`}
                  >
                    {password.length >= 8 ? '✓' : '○'} 8 caractères minimum
                  </p>
                )}
                {isConfirmation && confirmation.length > 0 && (
                  <p
                    className={`mt-1.5 text-label ${confirmation === password ? 'text-success' : 'text-muted'}`}
                  >
                    {confirmation === password ? '✓' : '○'} Les mots de passe correspondent
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
                    errors.form === SIGNED_UP_NOT_IN ? (
                      <Button asChild size="sm">
                        <Link href="/connexion">Se connecter</Link>
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
          {pending ? 'Envoi…' : ''}
        </span>
        {!state.twoFactor && (
          <motion.div {...slide} className="pt-1">
            <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
              {pending ? 'Envoi…' : copy.submit}
            </Button>
          </motion.div>
        )}
      </form>

      {page === 'connexion' && !state.twoFactor && (
        <Link
          href="/mot-de-passe-oublie"
          className="mt-4 inline-block text-ui text-accent underline underline-offset-4"
        >
          Mot de passe oublié ?
        </Link>
      )}

      {copy.href && (
        <motion.p {...slide} className="mt-6 border-t border-line pt-5 text-ui text-muted">
          {nb(copy.footer)}{' '}
          <Link
            href={copy.href}
            className="rounded-sm font-semibold text-accent underline decoration-accent-line underline-offset-4 transition-colors hover:decoration-accent"
          >
            {copy.other}
          </Link>
        </motion.p>
      )}
    </div>
  );
}
