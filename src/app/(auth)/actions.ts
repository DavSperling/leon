'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { auth, emailEnabled, type SocialProviderId, socialProviders } from '@/server/auth/auth';
import { pathAfterSignIn } from '@/server/auth/computer-authorize';
import { joinWithInvitation } from '@/server/auth/members';
import { authAttemptAllowed } from '@/server/auth/rate-limit';
import {
  getSession,
  getUserContext,
  ONBOARDING_PATH,
  signInWithPassword,
} from '@/server/auth/session';
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

  const { ok, twoFactor, unverified } = await signInWithPassword(
    parsed.data.email,
    parsed.data.password,
  );
  if (twoFactor) return { twoFactor: true, values };
  // Adresse non vérifiée : le lien vient d'être renvoyé (sendOnSignIn), on invite à ouvrir la boîte mail.
  if (unverified) return { errors: { form: t('verifyFirst') }, values };
  // Même message pour un e-mail inconnu et un mot de passe faux.
  if (!ok) return { errors: { form: t('wrongCredentials') }, values };
  // `retour` : l'autorisation d'un ordinateur qui a renvoyé ici (pathAfterSignIn la revalide) ; sinon l'accueil.
  redirect(pathAfterSignIn(formData.get('retour')));
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
  redirect(pathAfterSignIn(formData.get('retour')));
}

export async function requestPasswordResetAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getTranslations('auth');
  if (!emailEnabled) return { errors: { form: t('emailSendingOff') } };
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
  return finishSignUp(parsed.data.email, parsed.data.password, values, t);
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
  return finishSignUp(parsed.data.email, parsed.data.password, values, t);
}

// Après la création du compte. Quand Leon vérifie l'adresse (emailEnabled), le lien de vérification est déjà parti
// (auth.ts) : on ne connecte pas, on invite à le suivre. Sinon (envoi non configuré), on connecte directement.
async function finishSignUp(
  email: string,
  password: string,
  values: Record<string, string>,
  t: Translator,
): Promise<AuthFormState> {
  if (emailEnabled) return { message: t('verifySent') };
  const { ok } = await signInWithPassword(email, password);
  if (!ok) return { errors: { form: t('signedUpNotIn') }, values };
  redirect('/');
}

const INVITATION_TOKEN = /^[A-Za-z0-9_-]{43}$/; // le secret d'un lien d'invitation (members.ts)

// Où revenir après Google, Microsoft ou le SSO : la page du lien d'invitation, qui fait rejoindre son espace ; sinon
// le retour revalidé (un ordinateur, un assistant) ou l'accueil, et l'onboarding pour un compte tout neuf. Une erreur
// revient sur /connexion?error=…, que la page traduit.
function returnPaths(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  const invitation = INVITATION_TOKEN.test(token) ? `/invitation/${token}` : null;
  return {
    callbackURL: invitation ?? pathAfterSignIn(formData.get('retour')),
    newUserCallbackURL: invitation ?? ONBOARDING_PATH,
    errorCallbackURL: '/connexion',
  };
}

// « Continuer avec Google / Microsoft » : Better Auth rend l'adresse du fournisseur (son cookie d'état est posé par
// nextCookies), le navigateur y part.
export async function socialSignInAction(formData: FormData): Promise<void> {
  const provider = String(formData.get('provider') ?? '');
  if (!Object.hasOwn(socialProviders, provider)) redirect('/connexion');
  const { url } = await auth.api.signInSocial({
    body: { provider: provider as SocialProviderId, ...returnPaths(formData) },
    headers: await headers(),
  });
  redirect(url ?? '/connexion');
}

// « SSO d'entreprise » : le domaine de l'adresse désigne l'espace et son fournisseur (vérifié par DNS, auth.ts).
export async function ssoSignInAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getTranslations('auth');
  const email = String(formData.get('email') ?? '').trim();
  const values = { email };
  if (!z.email().safeParse(email).success) return { errors: { email: t('invalidEmail') }, values };
  if (!(await authAttemptAllowed('connexion', email, await headers()))) {
    return { errors: { form: t('tooManyAttempts') }, values };
  }
  let url: string;
  try {
    ({ url } = await auth.api.signInSSO({
      body: { email, ...returnPaths(formData) },
      headers: await headers(),
    }));
  } catch {
    // Domaine sans SSO, ou pas encore vérifié : le même message, rien n'est dit de l'espace.
    return { errors: { email: t('ssoNotFound') }, values };
  }
  redirect(url);
}

// Revenu de Google, Microsoft ou du SSO sur la page d'un lien d'invitation, sans espace : le lien le fait entrer.
export async function joinWithSessionAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  const session = await getSession();
  if (!session) redirect('/connexion');
  // Déjà dans un espace : un compte n'en rejoint pas un second par un lien (comme l'inscription par invitation).
  if (await getUserContext()) redirect('/');
  const tenantId = await joinWithInvitation(token, session.user.id);
  redirect(tenantId ? ONBOARDING_PATH : `/invitation/${token}`);
}
