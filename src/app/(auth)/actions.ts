'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/server/auth/auth';
import { authAttemptAllowed } from '@/server/auth/rate-limit';
import { signInWithPassword } from '@/server/auth/session';
import {
  createUserWithInvitation,
  createUserWithOrganization,
  JoinInputSchema,
  SignUpInputSchema,
} from '@/server/auth/sign-up';
import { env } from '@/server/env';
import { logError } from '@/server/log';

// `errors` : un message par champ ; `form` pour une erreur qui ne vise aucun champ.
// `values` : ce qui a été saisi (jamais le mot de passe), pour ne pas vider le formulaire.
export type AuthFormState = {
  errors?: Record<string, string>;
  values?: Record<string, string>;
  message?: string;
  twoFactor?: boolean;
};

const SignInSchema = z.object({ email: z.email(), password: z.string().min(1) });
const SignUpFormSchema = SignUpInputSchema.extend({ confirmation: z.string() }).refine(
  ({ password, confirmation }) => password === confirmation,
  { path: ['confirmation'], message: 'Les mots de passe ne correspondent pas.' },
);
const JoinFormSchema = JoinInputSchema.extend({ confirmation: z.string() }).refine(
  ({ password, confirmation }) => password === confirmation,
  { path: ['confirmation'], message: 'Les mots de passe ne correspondent pas.' },
);

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
  confirmation: 'Les mots de passe ne correspondent pas.',
  organizationName: 'Indiquez le nom de votre entreprise (2 à 100 caractères).',
};
const EMAIL_TAKEN = 'Cette adresse e-mail est déjà utilisée.';
const SIGN_UP_FAILED = 'Impossible de créer le compte. Réessayez.';
const SIGNED_UP_NOT_IN = 'Compte créé, mais la connexion a échoué. Connectez-vous.';

function readFields(formData: FormData, names: string[]): Record<string, string> {
  return Object.fromEntries(
    names.map((name) => {
      const value = String(formData.get(name) ?? '');
      return [name, name === 'password' || name === 'confirmation' ? value : value.trim()];
    }),
  );
}

function withoutPassword(fields: Record<string, string>): Record<string, string> {
  const { password: _password, confirmation: _confirmation, ...values } = fields;
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

  const { ok, twoFactor } = await signInWithPassword(parsed.data.email, parsed.data.password);
  if (twoFactor) return { twoFactor: true, values };
  // Même message pour un e-mail inconnu et un mot de passe faux.
  if (!ok) return { errors: { form: 'E-mail ou mot de passe incorrect.' }, values };
  redirect('/');
}

export async function verifyTwoFactorAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const code = String(formData.get('code') ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code))
    return { twoFactor: true, errors: { code: 'Saisissez le code à 6 chiffres.' } };
  try {
    await auth.api.verifyTOTP({ body: { code }, headers: await headers() });
  } catch {
    return { twoFactor: true, errors: { form: 'Code incorrect ou expiré. Réessayez.' } };
  }
  redirect('/');
}

export async function requestPasswordResetAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!z.email().safeParse(email).success) return { errors: { email: INVALID_EMAIL } };
  if (!(await authAttemptAllowed('recuperation', email, await headers()))) {
    return { errors: { form: TOO_MANY_ATTEMPTS } };
  }
  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: new URL('/reinitialiser', env.BETTER_AUTH_URL).toString() },
      headers: await headers(),
    });
  } catch (error) {
    // Même réponse si le compte n'existe pas ou si l'envoi échoue : ne pas révéler les comptes enregistrés.
    logError('auth.password_reset', error);
  }
  return {
    message:
      'Si cette adresse correspond à un compte, un lien de réinitialisation vient d’être envoyé.',
  };
}

const ResetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8).max(128),
    confirmation: z.string(),
  })
  .refine(({ password, confirmation }) => password === confirmation, {
    path: ['confirmation'],
    message: 'Les mots de passe ne correspondent pas.',
  });

export async function resetPasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = ResetPasswordSchema.safeParse({
    token: String(formData.get('token') ?? ''),
    password: String(formData.get('password') ?? ''),
    confirmation: String(formData.get('confirmation') ?? ''),
  });
  if (!parsed.success)
    return {
      errors: fieldErrors(parsed.error, {
        password: SIGN_UP_MESSAGES.password,
        confirmation: 'Les mots de passe ne correspondent pas.',
      }),
    };
  try {
    await auth.api.resetPassword({
      body: { token: parsed.data.token, newPassword: parsed.data.password },
    });
  } catch {
    return { errors: { form: 'Ce lien est invalide ou a expiré. Demandez-en un nouveau.' } };
  }
  return { message: 'Votre mot de passe a été changé. Vous pouvez vous connecter.' };
}

export async function signUpAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const fields = readFields(formData, [
    'name',
    'email',
    'password',
    'confirmation',
    'organizationName',
  ]);
  const values = withoutPassword(fields);
  const parsed = SignUpFormSchema.safeParse(fields);
  if (!parsed.success) return { errors: fieldErrors(parsed.error, SIGN_UP_MESSAGES), values };
  if (!(await authAttemptAllowed('inscription', parsed.data.email, await headers()))) {
    return { errors: { form: TOO_MANY_ATTEMPTS }, values };
  }

  const { confirmation: _confirmation, ...input } = parsed.data;
  const created = await createUserWithOrganization(input);
  if (!created.ok) {
    const errors: Record<string, string> =
      created.error === 'email_pris' ? { email: EMAIL_TAKEN } : { form: SIGN_UP_FAILED };
    return { errors, values };
  }
  return signInNewAccount(parsed.data.email, parsed.data.password, values);
}

// L'inscription par un lien d'invitation : le formulaire porte le secret du lien dans un champ caché.
export async function joinAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const fields = readFields(formData, ['name', 'email', 'password', 'confirmation', 'token']);
  const { token: _token, ...values } = withoutPassword(fields);
  const parsed = JoinFormSchema.safeParse(fields);
  if (!parsed.success) return { errors: fieldErrors(parsed.error, SIGN_UP_MESSAGES), values };
  if (!(await authAttemptAllowed('inscription', parsed.data.email, await headers()))) {
    return { errors: { form: TOO_MANY_ATTEMPTS }, values };
  }

  const { confirmation: _confirmation, ...input } = parsed.data;
  const created = await createUserWithInvitation(input);
  if (!created.ok) {
    const errors: Record<string, string> =
      created.error === 'email_pris'
        ? { email: EMAIL_TAKEN }
        : created.error === 'lien_invalide'
          ? { form: 'Ce lien d’invitation n’est plus valable. Demandez-en un nouveau.' }
          : { form: SIGN_UP_FAILED };
    return { errors, values };
  }
  return signInNewAccount(parsed.data.email, parsed.data.password, values);
}

async function signInNewAccount(
  email: string,
  password: string,
  values: Record<string, string>,
): Promise<AuthFormState> {
  const { ok } = await signInWithPassword(email, password);
  if (!ok) return { errors: { form: SIGNED_UP_NOT_IN }, values };
  redirect('/');
}
