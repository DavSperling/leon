'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { LOCALE_COOKIE, localeOf, locales } from '@/i18n/request';
import { createApiToken, revokeApiToken } from '@/server/auth/api-tokens';
import { auth } from '@/server/auth/auth';
import {
  DeletionRefused,
  type DeletionResult,
  deleteAccount,
  deleteOrganization,
} from '@/server/auth/delete-account';
import { createInvitationLink } from '@/server/auth/members';
import { authAttemptAllowed } from '@/server/auth/rate-limit';
import {
  getSession,
  requestHeaders,
  requireUserContext,
  signOutCurrentUser,
} from '@/server/auth/session';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ABOUT_MAX_CHARS, saveAbout } from '@/server/briefing/about';
import { forgetPipedreamUser } from '@/server/connectors/pipedream';
import { sendDeletionEmail } from '@/server/email/account-deleted';
import { env } from '@/server/env';
import { logError } from '@/server/log';

export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = z.enum(locales).safeParse(formData.get('locale'));
  if (!locale.success) return;
  (await cookies()).set(LOCALE_COOKIE, locale.data, {
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
  revalidatePath('/', 'layout');
}

const TokenNameSchema = z.string().trim().min(1).max(80);

// Le jeton en clair n'existe que dans cette réponse : il n'est ni journalisé ni relisible ensuite.
export async function createTokenAction(
  name: string,
): Promise<{ token: string; hint: string } | { error: string }> {
  const ctx = await requireUserContext();
  const t = await getTranslations('settings');
  const parsed = TokenNameSchema.safeParse(name);
  if (!parsed.success) return { error: t('invalidTokenName') };
  const { token, hint } = await createApiToken(ctx, parsed.data);
  revalidatePath('/reglages');
  return { token, hint };
}

// Comme le jeton : le lien en clair n'existe que dans cette réponse.
export async function createInvitationAction(): Promise<
  { url: string; expiresAt: Date } | { error: string }
> {
  const ctx = await requireUserContext();
  const t = await getTranslations('settings');
  const link = await createInvitationLink(ctx);
  if (!link) return { error: t('invitePermission') };
  const url = new URL(`/invitation/${link.token}`, env.BETTER_AUTH_URL).toString();
  return { url, expiresAt: link.expiresAt };
}

export async function revokeTokenAction(tokenId: string): Promise<{ ok: boolean }> {
  const ctx = await requireUserContext();
  if (!z.uuid().safeParse(tokenId).success) return { ok: false };
  const ok = await revokeApiToken(ctx, tokenId);
  revalidatePath('/reglages');
  return { ok };
}

export async function updateProfileAction(name: string): Promise<{ ok: true } | { error: string }> {
  await requireUserContext();
  const t = await getTranslations('security');
  const parsed = z.string().trim().min(1).max(100).safeParse(name);
  if (!parsed.success) return { error: t('nameInvalid') };
  try {
    await auth.api.updateUser({ body: { name: parsed.data }, headers: await requestHeaders() });
  } catch {
    return { error: t('profileFailed') };
  }
  revalidatePath('/reglages');
  return { ok: true };
}

// Un texte vide efface ce que l'utilisateur disait de lui.
export async function updateAboutAction(about: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await requireUserContext();
  const t = await getTranslations('about');
  const parsed = z.string().trim().max(ABOUT_MAX_CHARS).safeParse(about);
  if (!parsed.success) return { error: t('tooLong', { max: ABOUT_MAX_CHARS }) };
  try {
    await saveAbout(ctx, parsed.data || null);
  } catch {
    return { error: t('failed') };
  }
  revalidatePath('/reglages');
  return { ok: true };
}

// Les actions qui vérifient le mot de passe comptent dans la limite de la connexion (rate-limit.ts), par e-mail :
// une session volée ne permet pas d'essayer des mots de passe sans fin.
async function passwordCheckAllowed(): Promise<boolean> {
  const session = await getSession();
  if (!session) redirect('/connexion');
  return authAttemptAllowed('connexion', session.user.email, await requestHeaders());
}

// Les autres sessions, peut-être volées, sont fermées ; Better Auth en ouvre une nouvelle pour celle-ci.
export async function changePasswordAction(
  current: string,
  password: string,
  confirmation: string,
): Promise<{ ok: true } | { error: string }> {
  const t = await getTranslations('security');
  const form = await getTranslations('auth');
  if (password.length < 8 || password.length > 128) return { error: form('passwordLength') };
  if (password !== confirmation) return { error: form('passwordsMismatch') };
  if (!(await passwordCheckAllowed())) return { error: t('tooManyAttempts') };
  try {
    await auth.api.changePassword({
      body: { currentPassword: current, newPassword: password, revokeOtherSessions: true },
      headers: await requestHeaders(),
    });
  } catch {
    return { error: t('wrongPassword') };
  }
  return { ok: true };
}

export async function enableTotpAction(
  password: string,
): Promise<{ uri: string; backupCodes: string[] } | { error: string }> {
  const t = await getTranslations('security');
  if (!(await passwordCheckAllowed())) return { error: t('tooManyAttempts') };
  try {
    const result = await auth.api.enableTwoFactor({
      body: { password, method: 'totp' },
      headers: await requestHeaders(),
    });
    if (result.method !== 'totp') return { error: t('enableFailed') };
    return { uri: result.totpURI, backupCodes: result.backupCodes };
  } catch {
    return { error: t('wrongPassword') };
  }
}

export async function verifyTotpSetupAction(
  code: string,
): Promise<{ ok: true } | { error: string }> {
  await requireUserContext();
  const t = await getTranslations('security');
  if (!/^\d{6}$/.test(code)) return { error: t('codeInvalid') };
  try {
    // Better Auth remplace la session (la nouvelle porte la 2FA) : requestHeaders() suit le nouveau cookie.
    await auth.api.verifyTOTP({ body: { code }, headers: await requestHeaders() });
  } catch {
    return { error: t('codeWrong') };
  }
  // Les sessions ouvertes ailleurs, peut-être volées, se sont passées du code : elles sont fermées.
  await auth.api.revokeOtherSessions({ headers: await requestHeaders() });
  revalidatePath('/reglages');
  return { ok: true };
}

export async function disableTotpAction(
  password: string,
): Promise<{ ok: true } | { error: string }> {
  const t = await getTranslations('security');
  if (!(await passwordCheckAllowed())) return { error: t('tooManyAttempts') };
  try {
    await auth.api.disableTwoFactor({ body: { password }, headers: await requestHeaders() });
  } catch {
    return { error: t('wrongPassword') };
  }
  revalidatePath('/reglages');
  return { ok: true };
}

// Les anciens codes de secours cessent de marcher ; les nouveaux ne sont montrés qu'une fois.
export async function regenerateBackupCodesAction(
  password: string,
): Promise<{ backupCodes: string[] } | { error: string }> {
  const t = await getTranslations('security');
  if (!(await passwordCheckAllowed())) return { error: t('tooManyAttempts') };
  try {
    const { backupCodes } = await auth.api.generateBackupCodes({
      body: { password },
      headers: await requestHeaders(),
    });
    return { backupCodes };
  } catch {
    return { error: t('wrongPassword') };
  }
}

const DeletionInputSchema = z.object({ password: z.string(), code: z.string(), word: z.string() });
type DeletionInput = z.infer<typeof DeletionInputSchema>;
// `organizationToo` : ce que le dialogue a annoncé, que le module relit avant de rien effacer (`situation`).
const AccountDeletionInputSchema = DeletionInputSchema.extend({
  successorId: z.uuid().nullable(),
  organizationToo: z.boolean(),
});

// Ce qui part ne revient pas : le mot tapé, le mot de passe et, avec la 2FA, le code de l'application. Rend le
// message du premier qui ne passe pas, ou null.
async function confirmIdentity({ password, code, word }: DeletionInput): Promise<string | null> {
  const t = await getTranslations('deleteAccount');
  const security = await getTranslations('security');
  if (!(await passwordCheckAllowed())) return security('tooManyAttempts');
  if (word.trim() !== t('word')) return t('wrongWord', { word: t('word') });
  const headers = await requestHeaders();
  try {
    await auth.api.verifyPassword({ body: { password }, headers });
  } catch {
    return security('wrongPassword');
  }
  // Avec une session ouverte, Better Auth ne compte pas les échecs du code : seule la limite d'essais protège.
  // Une session qui vient de disparaître ne dispense pas du code.
  const session = await getSession();
  if (!session || session.user.twoFactorEnabled) {
    try {
      await auth.api.verifyTOTP({ body: { code }, headers });
    } catch {
      return t('wrongCode');
    }
  }
  return null;
}

async function runDeletion<Input extends DeletionInput>(
  schema: z.ZodType<Input>,
  rawInput: unknown,
  deletion: (ctx: TenantContext, input: Input) => Promise<DeletionResult>,
  redirectTo: '/connexion?supprime=compte' | '/connexion?supprime=organisation',
): Promise<{ error: string }> {
  const ctx = await requireUserContext();
  const t = await getTranslations('deleteAccount');
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) return { error: t('failed') };
  const input = parsed.data;
  const refusal = await confirmIdentity(input);
  if (refusal) return { error: refusal };

  let result: DeletionResult;
  try {
    result = await deletion(ctx, input);
  } catch (error) {
    if (error instanceof DeletionRefused) return { error: t(`refused.${error.reason}`) };
    // Y compris un second envoi du formulaire : la première suppression a déjà retiré la personne.
    logError('account.deletion_failed', error);
    return { error: t('failed') };
  }

  // Tout est fait en base : ni Pipedream ni Resend ne peuvent plus faire échouer la suppression.
  const locale = localeOf(await getLocale());
  await Promise.all(
    result.pipedreamUsers.map((id) =>
      forgetPipedreamUser(id).catch((error) => logError('account.deletion_pipedream', error)),
    ),
  );
  // Resend limite à 2 requêtes par seconde : un message après l'autre, et un échec n'arrête pas les suivants.
  for (const { email, kind } of result.notify) {
    await sendDeletionEmail({
      to: email,
      locale,
      kind,
      organizationName: result.organizationName,
    }).catch((error) => logError('account.deletion_email', error));
  }
  // La session est déjà effacée en base : il ne reste que les cookies à retirer.
  await signOutCurrentUser().catch(() => undefined);
  redirect(redirectTo);
}

// `successorId` ne sert qu'au seul propriétaire qui laisse d'autres membres. En cas de succès, ne rend pas : la page
// part vers la connexion.
export async function deleteAccountAction(
  input: z.input<typeof AccountDeletionInputSchema>,
): Promise<{ error: string }> {
  return runDeletion(
    AccountDeletionInputSchema,
    input,
    (ctx, { successorId, organizationToo }) => deleteAccount(ctx, successorId, organizationToo),
    '/connexion?supprime=compte',
  );
}

export async function deleteOrganizationAction(
  input: z.input<typeof DeletionInputSchema>,
): Promise<{ error: string }> {
  return runDeletion(
    DeletionInputSchema,
    input,
    (ctx) => deleteOrganization(ctx),
    '/connexion?supprime=organisation',
  );
}
