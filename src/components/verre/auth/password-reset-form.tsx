'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef } from 'react';
import {
  type AuthFormState,
  requestPasswordResetAction,
  resetPasswordAction,
} from '@/app/(auth)/actions';
import { Button } from '@/components/verre/ui/button';
import { Field, Input } from '@/components/verre/ui/form';
import { nb } from '@/lib/verre/nb';
import { AuthLink, AuthNote, AuthSheet, AuthTitle } from './frame';

const DOOR = 'h-10 w-full max-shell:h-11';

/** La vue « fait », dans la même feuille : le titre sous le trait vert, la phrase du produit, le seul bouton. */
function Done({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action: { href: string; label: string; ink?: boolean };
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.querySelector<HTMLElement>('h1')?.focus(), []);
  return (
    <div ref={ref}>
      <AuthTitle done>{title}</AuthTitle>
      <p role="status" className="mt-3 text-title leading-[1.5] text-pretty text-fg">
        {nb(text)}
      </p>
      <Button asChild variant={action.ink ? 'primary' : 'secondary'} className={`${DOOR} mt-6`}>
        <Link href={action.href}>{action.label}</Link>
      </Button>
    </div>
  );
}

/** « Mot de passe oublié ? » : l'adresse, puis la phrase prudente (elle ne dit jamais si un compte existe). */
export function RequestPasswordResetForm() {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    requestPasswordResetAction,
    {},
  );
  if (state.message)
    return (
      <AuthSheet>
        <Done
          title={t('checkEmailTitle')}
          text={state.message}
          action={{ href: '/connexion', label: t('backToSignIn') }}
        />
      </AuthSheet>
    );
  return (
    <AuthSheet alt={<AuthLink href="/connexion">{t('backToSignIn')}</AuthLink>}>
      <AuthTitle>{t('forgotTitle')}</AuthTitle>
      <form action={action} noValidate className="mt-6 grid gap-4">
        <Field label={t('email')} error={state.errors?.email}>
          <Input
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
          />
        </Field>
        {state.errors?.form && <AuthNote tone="error">{state.errors.form}</AuthNote>}
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          loadingLabel={t('sending')}
          className={`${DOOR} mt-2`}
        >
          {t('sendLink')}
        </Button>
      </form>
    </AuthSheet>
  );
}

/** Le lien de l'e-mail : le nouveau mot de passe et sa confirmation, avec les mêmes marques qu'à l'inscription. */
export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState<AuthFormState, FormData>(resetPasswordAction, {});
  if (state.message)
    return (
      <AuthSheet>
        <Done
          title={t('resetDoneTitle')}
          text={state.message}
          action={{ href: '/connexion', label: t('signIn'), ink: true }}
        />
      </AuthSheet>
    );
  return (
    <AuthSheet alt={<AuthLink href="/connexion">{t('backToSignIn')}</AuthLink>}>
      <AuthTitle>{t('newPassword')}</AuthTitle>
      <form action={action} noValidate className="mt-6 grid gap-4">
        <input type="hidden" name="token" value={token} />
        <Field label={t('newPassword')} help={t('passwordHint')} error={state.errors?.password}>
          <Input name="password" type="password" autoComplete="new-password" autoFocus required />
        </Field>
        <Field label={t('confirmPassword')} error={state.errors?.confirmation}>
          <Input name="confirmation" type="password" autoComplete="new-password" required />
        </Field>
        {state.errors?.form && (
          <div className="grid justify-items-start gap-2">
            <AuthNote tone="error">{state.errors.form}</AuthNote>
            <Button asChild size="xs" className="ml-4">
              <Link href="/mot-de-passe-oublie">{t('requestNewLink')}</Link>
            </Button>
          </div>
        )}
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          loadingLabel={t('sending')}
          className={`${DOOR} mt-2`}
        >
          {t('changePassword')}
        </Button>
      </form>
    </AuthSheet>
  );
}
