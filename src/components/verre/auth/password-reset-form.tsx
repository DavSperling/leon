'use client';

import Link from 'next/link';
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
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    requestPasswordResetAction,
    {},
  );
  return (
    <form action={action} className="mt-6 grid gap-4">
      <Field label="E-mail" error={state.errors?.email}>
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
          Envoyer le lien
        </Button>
      )}
      <Link href="/connexion" className="text-ui text-accent underline underline-offset-4">
        Retour à la connexion
      </Link>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="mt-6 grid gap-4">
      <input type="hidden" name="token" value={token} />
      <Field
        label="Nouveau mot de passe"
        help="8 caractères minimum."
        error={state.errors?.password}
      >
        <Input name="password" type="password" autoComplete="new-password" autoFocus />
      </Field>
      <Field label="Confirmer le mot de passe" error={state.errors?.confirmation}>
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
            Se connecter
          </Link>
        </>
      ) : (
        <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
          Changer le mot de passe
        </Button>
      )}
    </form>
  );
}
