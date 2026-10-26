'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { createApiToken, revokeApiToken } from '@/server/auth/api-tokens';
import { auth } from '@/server/auth/auth';
import { createInvitationLink } from '@/server/auth/members';
import { requireUserContext } from '@/server/auth/session';
import { env } from '@/server/env';

const TokenNameSchema = z.string().trim().min(1).max(80);

// Le jeton en clair n'existe que dans cette réponse : il n'est ni journalisé ni relisible ensuite.
export async function createTokenAction(
  name: string,
): Promise<{ token: string; hint: string } | { error: string }> {
  const ctx = await requireUserContext();
  const parsed = TokenNameSchema.safeParse(name);
  if (!parsed.success) return { error: "Donnez un nom à l'appareil (80 caractères au plus)." };
  const { token, hint } = await createApiToken(ctx, parsed.data);
  revalidatePath('/reglages');
  return { token, hint };
}

// Comme le jeton : le lien en clair n'existe que dans cette réponse.
export async function createInvitationAction(): Promise<
  { url: string; expiresAt: Date } | { error: string }
> {
  const ctx = await requireUserContext();
  const link = await createInvitationLink(ctx);
  if (!link) return { error: 'Seuls les propriétaires et les administrateurs peuvent inviter.' };
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

export async function updateProfileAction(name: string): Promise<{ error?: string; ok?: boolean }> {
  await requireUserContext();
  const parsed = z.string().trim().min(1).max(100).safeParse(name);
  if (!parsed.success) return { error: 'Le nom doit contenir entre 1 et 100 caractères.' };
  await auth.api.updateUser({ body: { name: parsed.data }, headers: await headers() });
  revalidatePath('/reglages');
  return { ok: true };
}

export async function enableTotpAction(
  password: string,
): Promise<{ uri: string; backupCodes: string[] } | { error: string }> {
  await requireUserContext();
  try {
    const result = await auth.api.enableTwoFactor({
      body: { password, method: 'totp' },
      headers: await headers(),
    });
    if (result.method !== 'totp')
      return { error: 'Impossible de créer la clé d’authentification.' };
    return { uri: result.totpURI, backupCodes: result.backupCodes };
  } catch {
    return { error: 'Mot de passe incorrect ou authentification déjà configurée.' };
  }
}

export async function verifyTotpSetupAction(
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireUserContext();
  try {
    await auth.api.verifyTOTP({ body: { code }, headers: await headers() });
    revalidatePath('/reglages');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Code incorrect. Vérifiez l’application et réessayez.' };
  }
}

export async function disableTotpAction(
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireUserContext();
  try {
    await auth.api.disableTwoFactor({ body: { password }, headers: await headers() });
    revalidatePath('/reglages');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Mot de passe incorrect.' };
  }
}
