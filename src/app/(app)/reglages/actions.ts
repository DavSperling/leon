'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createApiToken, revokeApiToken } from '@/server/auth/api-tokens';
import { requireUserContext } from '@/server/auth/session';

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

export async function revokeTokenAction(tokenId: string): Promise<{ ok: boolean }> {
  const ctx = await requireUserContext();
  if (!z.uuid().safeParse(tokenId).success) return { ok: false };
  const ok = await revokeApiToken(ctx, tokenId);
  revalidatePath('/reglages');
  return { ok };
}
