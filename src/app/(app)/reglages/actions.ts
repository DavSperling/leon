'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { LOCALE_COOKIE, locales } from '@/i18n/request';
import { createApiToken, revokeApiToken } from '@/server/auth/api-tokens';
import { auth } from '@/server/auth/auth';
import { createInvitationLink, removeMember, setMemberRole } from '@/server/auth/members';
import { setManager } from '@/server/auth/organisation';
import { authAttemptAllowed } from '@/server/auth/rate-limit';
import { getSession, requestHeaders, requireUserContext } from '@/server/auth/session';
import { env } from '@/server/env';

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

// Organigramme et membres (0036) : réservés aux propriétaires et administrateurs, ce que members.ts et organisation.ts
// vérifient, avec les identifiants reçus du navigateur.
export async function setManagerAction(
  memberId: string,
  managerId: string | null,
): Promise<{ result: 'ok' | 'refuse' | 'boucle' }> {
  const ctx = await requireUserContext();
  const result = await setManager(ctx, memberId, managerId);
  if (result === 'ok') {
    revalidatePath('/reglages');
    revalidatePath('/equipe');
  }
  return { result };
}

export async function setMemberRoleAction(
  memberId: string,
  role: string,
): Promise<{ ok: boolean }> {
  const ctx = await requireUserContext();
  const parsed = z.enum(['admin', 'member']).safeParse(role);
  const ok = parsed.success && (await setMemberRole(ctx, memberId, parsed.data));
  if (ok) revalidatePath('/reglages');
  return { ok };
}

export async function removeMemberAction(memberId: string): Promise<{ ok: boolean }> {
  const ctx = await requireUserContext();
  const ok = await removeMember(ctx, memberId);
  if (ok) {
    revalidatePath('/reglages');
    revalidatePath('/equipe');
  }
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

// Les actions qui vérifient le mot de passe comptent dans la limite de la connexion (rate-limit.ts), par e-mail :
// une session volée ne permet pas d'essayer des mots de passe sans fin.
async function passwordCheckAllowed(): Promise<boolean> {
  const session = await getSession();
  if (!session) redirect('/connexion');
  return authAttemptAllowed('connexion', session.user.email, await requestHeaders());
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
