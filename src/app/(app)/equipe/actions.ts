'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { setFollowed } from '@/server/auth/organisation';
import { requireUserContext } from '@/server/auth/session';

const FamiliesSchema = z.array(z.string().max(20)).max(20);

// Ce que le lecteur suit d'une personne sous lui ; setFollowed vérifie qu'elle l'est et ne garde que les familles connues.
export async function setFollowedAction(
  memberId: string,
  families: string[],
): Promise<{ ok: boolean }> {
  const ctx = await requireUserContext();
  const parsed = FamiliesSchema.safeParse(families);
  const ok = parsed.success && (await setFollowed(ctx, memberId, parsed.data));
  if (ok) revalidatePath('/equipe');
  return { ok };
}
