'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { authAttemptAllowed } from '@/server/auth/rate-limit';
import { signInWithPassword } from '@/server/auth/session';
import { createUserWithOrganization, SignUpInputSchema } from '@/server/auth/sign-up';

// `errors` : un message par champ ; `form` pour une erreur qui ne vise aucun champ.
// `values` : ce qui a été saisi (jamais le mot de passe), pour ne pas vider le formulaire.
export type AuthFormState = {
  errors?: Record<string, string>;
  values?: Record<string, string>;
};

const SignInSchema = z.object({ email: z.email(), password: z.string().min(1) });

const INVALID_EMAIL = 'Saisissez une adresse e-mail valide.';
// Au-delà de la limite de débit (rate-limit.ts), par adresse IP ou par e-mail : rien n'est essayé.
const TOO_MANY_ATTEMPTS = 'Trop de tentatives. Réessayez dans quelques minutes.';

const SIGN_IN_MESSAGES = {
  email: INVALID_EMAIL,
  password: 'Saisissez votre mot de passe.',
};
const SIGN_UP_MESSAGES = {
  name: 'Indiquez votre nom.',
  email: INVALID_EMAIL,
  password: 'Le mot de passe doit contenir entre 8 et 128 caractères.',
  organizationName: 'Indiquez le nom de votre entreprise (2 à 100 caractères).',
};

function readFields(formData: FormData, names: string[]): Record<string, string> {
  return Object.fromEntries(
    names.map((name) => {
      const value = String(formData.get(name) ?? '');
      return [name, name === 'password' ? value : value.trim()];
    }),
  );
}

function withoutPassword(fields: Record<string, string>): Record<string, string> {
  const { password: _password, ...values } = fields;
  return values;
}

function fieldErrors(error: z.ZodError, messages: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0]);
    errors[field] ??= messages[field] ?? 'Valeur invalide.';
  }
  return errors;
}

export async function signInAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const fields = readFields(formData, ['email', 'password']);
  const values = withoutPassword(fields);
  const parsed = SignInSchema.safeParse(fields);
  if (!parsed.success) return { errors: fieldErrors(parsed.error, SIGN_IN_MESSAGES), values };
  if (!(await authAttemptAllowed('connexion', parsed.data.email, await headers()))) {
    return { errors: { form: TOO_MANY_ATTEMPTS }, values };
  }

  const { ok } = await signInWithPassword(parsed.data.email, parsed.data.password);
  // Même message pour un e-mail inconnu et un mot de passe faux.
  if (!ok) return { errors: { form: 'E-mail ou mot de passe incorrect.' }, values };
  redirect('/');
}

export async function signUpAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const fields = readFields(formData, ['name', 'email', 'password', 'organizationName']);
  const values = withoutPassword(fields);
  const parsed = SignUpInputSchema.safeParse(fields);
  if (!parsed.success) return { errors: fieldErrors(parsed.error, SIGN_UP_MESSAGES), values };
  if (!(await authAttemptAllowed('inscription', parsed.data.email, await headers()))) {
    return { errors: { form: TOO_MANY_ATTEMPTS }, values };
  }

  const created = await createUserWithOrganization(parsed.data);
  if (!created.ok) {
    const errors: Record<string, string> =
      created.error === 'email_pris'
        ? { email: 'Cette adresse e-mail est déjà utilisée.' }
        : { form: 'Impossible de créer le compte. Réessayez.' };
    return { errors, values };
  }

  const { ok } = await signInWithPassword(parsed.data.email, parsed.data.password);
  if (!ok)
    return { errors: { form: 'Compte créé, mais la connexion a échoué. Connectez-vous.' }, values };
  redirect('/');
}
