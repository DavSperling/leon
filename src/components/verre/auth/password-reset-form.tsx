'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  type AuthFormState,
  requestPasswordResetAction,
  resetPasswordAction,
} from '@/app/(auth)/actions';
import { Button } from '@/components/verre/ui/button';
import { Notice } from '@/components/verre/ui/feedback';
import { Field, Input } from '@/components/verre/ui/form';

export function RequestPasswordResetForm() {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    requestPasswordResetAction,
    {},
  );
  return (
    <form action={action} className="mt-6 grid gap-4">
      <Field label={t('email')} error={state.errors?.email}>
        <Input name="email" type="email" autoComplete="email" autoFocus />
      </Field>
      {state.errors?.form && (
        <Notice tone="error" live="alert">
          {state.errors.form}
        </Notice>
      )}
      {state.message && (
        <Notice tone="success" live="status">
          {state.message}
        </Notice>
      )}
      {!state.message && (
        <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
          {t('sendLink')}
        </Button>
      )}
      <Link href="/connexion" className="text-ui text-accent underline underline-offset-4">
        {t('backToSignIn')}
      </Link>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState<AuthFormState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="mt-6 grid gap-4">
      <input type="hidden" name="token" value={token} />
      <Field label={t('newPassword')} help={t('passwordHint')} error={state.errors?.password}>
        <Input name="password" type="password" autoComplete="new-password" autoFocus />
      </Field>
      <Field label={t('confirmPassword')} error={state.errors?.confirmation}>
        <Input name="confirmation" type="password" autoComplete="new-password" />
      </Field>
      {state.errors?.form && (
        <Notice tone="error" live="alert">
          {state.errors.form}
        </Notice>
      )}
      {state.message ? (
        <>
          <Notice tone="success" live="status">
            {state.message}
          </Notice>
          <Link href="/connexion" className="text-ui text-accent underline underline-offset-4">
            {t('signIn')}
          </Link>
        </>
      ) : (
        <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
          {t('changePassword')}
        </Button>
      )}
    </form>
  );
}
