'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createApiToken, revokeApiToken } from '@/server/auth/api-tokens';
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
