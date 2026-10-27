'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { auth, passwordResetEnabled } from '@/server/auth/auth';
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

type Translator = ReturnType<typeof useTranslations<'auth'>>;

// Les schémas ne portent aucun message : fieldErrors() pose celui de chaque champ, dans la langue de la requête.
const SignInSchema = z.object({ email: z.email(), password: z.string().min(1) });
const SignUpFormSchema = SignUpInputSchema.extend({ confirmation: z.string() }).refine(
  ({ password, confirmation }) => password === confirmation,
  { path: ['confirmation'] },
);
const JoinFormSchema = JoinInputSchema.extend({ confirmation: z.string() }).refine(
  ({ password, confirmation }) => password === confirmation,
  { path: ['confirmation'] },
);

const signInMessages = (t: Translator) => ({
  email: t('invalidEmail'),
  password: t('passwordRequired'),
});
const signUpMessages = (t: Translator) => ({
  name: t('nameRequired'),
  email: t('invalidEmail'),
  password: t('passwordLength'),
  confirmation: t('passwordsMismatch'),
  organizationName: t('companyInvalid'),
});

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

function fieldErrors(
  error: z.ZodError,
  messages: Record<string, string>,
  t: Translator,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0]);
    errors[field] ??= messages[field] ?? t('invalidValue');
  }
  return errors;
}

export async function signInAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getTranslations('auth');
  const fields = readFields(formData, ['email', 'password']);
  const values = withoutPassword(fields);
  const parsed = SignInSchema.safeParse(fields);
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error, signInMessages(t), t), values };
  }
  // Au-delà de la limite de débit (rate-limit.ts), par adresse IP ou par e-mail : rien n'est essayé.
  if (!(await authAttemptAllowed('connexion', parsed.data.email, await headers()))) {
    return { errors: { form: t('tooManyAttempts') }, values };
  }

  const { ok, twoFactor } = await signInWithPassword(parsed.data.email, parsed.data.password);
  if (twoFactor) return { twoFactor: true, values };
  // Même message pour un e-mail inconnu et un mot de passe faux.
  if (!ok) return { errors: { form: t('wrongCredentials') }, values };
  redirect('/');
}

const TOTP_CODE = /^\d{6}$/;
// Un code de secours de Better Auth : 10 lettres ou chiffres, affichés en deux groupes de 5 (« V5qHD-kSFGw »).
const BACKUP_CODE = /^[A-Za-z0-9]{5}-?[A-Za-z0-9]{5}$/;

export async function verifyTwoFactorAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getTranslations('auth');
  const code = String(formData.get('code') ?? '').replace(/\s/g, '');
  const isTotp = TOTP_CODE.test(code);
  if (!isTotp && !BACKUP_CODE.test(code))
    return { twoFactor: true, errors: { code: t('codeFormat') } };
  try {
    if (isTotp) await auth.api.verifyTOTP({ body: { code }, headers: await headers() });
    // Téléphone perdu : un code de secours ouvre la session, une seule fois.
    else
      await auth.api.verifyBackupCode({
        body: { code: `${code.slice(0, 5)}-${code.slice(-5)}` },
        headers: await headers(),
      });
  } catch {
    return { twoFactor: true, errors: { form: t('codeWrong') } };
  }
  redirect('/');
}

export async function requestPasswordResetAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getTranslations('auth');
  if (!passwordResetEnabled) return { errors: { form: t('emailSendingOff') } };
  const email = String(formData.get('email') ?? '').trim();
  if (!z.email().safeParse(email).success) return { errors: { email: t('invalidEmail') } };
  if (!(await authAttemptAllowed('recuperation', email, await headers()))) {
    return { errors: { form: t('tooManyAttempts') } };
  }
  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: new URL('/reinitialiser', env.BETTER_AUTH_URL).toString() },
      headers: await headers(),
    });
  } catch (error) {
    // Même réponse si le compte n'existe pas : ne pas révéler les comptes enregistrés. L'échec de l'envoi
    // lui-même est journalisé par auth.ts.
    logError('auth.password_reset', error);
  }
  return { message: t('resetSent') };
}

const ResetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8).max(128),
    confirmation: z.string(),
  })
  .refine(({ password, confirmation }) => password === confirmation, {
    path: ['confirmation'],
  });

export async function resetPasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getTranslations('auth');
  const parsed = ResetPasswordSchema.safeParse({
    token: String(formData.get('token') ?? ''),
    password: String(formData.get('password') ?? ''),
    confirmation: String(formData.get('confirmation') ?? ''),
  });
  if (!parsed.success)
    return {
      errors: fieldErrors(
        parsed.error,
        { password: t('passwordLength'), confirmation: t('passwordsMismatch') },
        t,
      ),
    };
  try {
    await auth.api.resetPassword({
      body: { token: parsed.data.token, newPassword: parsed.data.password },
    });
  } catch {
    return { errors: { form: t('resetLinkInvalid') } };
  }
  return { message: t('resetDone') };
}

export async function signUpAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getTranslations('auth');
  const fields = readFields(formData, [
    'name',
    'email',
    'password',
    'confirmation',
    'organizationName',
  ]);
  const values = withoutPassword(fields);
  const parsed = SignUpFormSchema.safeParse(fields);
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error, signUpMessages(t), t), values };
  }
  if (!(await authAttemptAllowed('inscription', parsed.data.email, await headers()))) {
    return { errors: { form: t('tooManyAttempts') }, values };
  }

  const { confirmation: _confirmation, ...input } = parsed.data;
  const created = await createUserWithOrganization(input);
  if (!created.ok) {
    const errors: Record<string, string> =
      created.error === 'email_pris' ? { email: t('emailTaken') } : { form: t('signUpFailed') };
    return { errors, values };
  }
  return signInNewAccount(parsed.data.email, parsed.data.password, values, t);
}

// L'inscription par un lien d'invitation : le formulaire porte le secret du lien dans un champ caché.
export async function joinAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getTranslations('auth');
  const fields = readFields(formData, ['name', 'email', 'password', 'confirmation', 'token']);
  const { token: _token, ...values } = withoutPassword(fields);
  const parsed = JoinFormSchema.safeParse(fields);
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error, signUpMessages(t), t), values };
  }
  if (!(await authAttemptAllowed('inscription', parsed.data.email, await headers()))) {
    return { errors: { form: t('tooManyAttempts') }, values };
  }

  const { confirmation: _confirmation, ...input } = parsed.data;
  const created = await createUserWithInvitation(input);
  if (!created.ok) {
    const errors: Record<string, string> =
      created.error === 'email_pris'
        ? { email: t('emailTaken') }
        : created.error === 'lien_invalide'
          ? { form: t('inviteInvalid') }
          : { form: t('signUpFailed') };
    return { errors, values };
  }
  return signInNewAccount(parsed.data.email, parsed.data.password, values, t);
}

async function signInNewAccount(
  email: string,
  password: string,
  values: Record<string, string>,
  t: Translator,
): Promise<AuthFormState> {
  const { ok } = await signInWithPassword(email, password);
  if (!ok) return { errors: { form: t('signedUpNotIn') }, values };
  redirect('/');
}
