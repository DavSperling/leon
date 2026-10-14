'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUserContext } from '@/server/auth/session';
import {
  type ResolveResult,
  type ReviewResolution,
  ReviewResolutionSchema,
  resolveReviewItem,
} from '@/server/memory/review-items';

// Décision sous les droits du lecteur connecté. On rafraîchit aussi après un refus : l'élément a pu
// être traité entre-temps, la liste affichée est alors périmée. Le layout porte le compteur de la
// barre latérale.
export async function resolveReviewAction(
  itemId: string,
  resolution: ReviewResolution,
): Promise<ResolveResult> {
  const ctx = await requireUserContext();
  const result = await resolveReviewItem(
    ctx,
    z.uuid().parse(itemId),
    ReviewResolutionSchema.parse(resolution),
  );
  revalidatePath('/a-verifier');
  revalidatePath('/', 'layout');
  return result;
}
