'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { LOCALE_COOKIE, locales } from '@/i18n/request';
import { createApiToken, revokeApiToken } from '@/server/auth/api-tokens';
import { createInvitationLink } from '@/server/auth/members';
import { requireUserContext } from '@/server/auth/session';
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
