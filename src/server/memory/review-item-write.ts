import { z } from 'zod';
import { SENSITIVE_CATEGORIES } from '@/lib/enums';
import type { TenantContext } from '@/server/auth/tenant-context';
import { reviewItems } from '@/server/db/schema/memory';
import type { Tx } from '@/server/db/with-tenant';

// Création des éléments « À vérifier », seul chemin d'écriture (facts.ts et le rangement).
// À part de review-items.ts, qui importe facts.ts : pas de cycle d'import.

export const ReviewPayloadSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('sensitive_fact'),
      factId: z.uuid(),
      category: z.enum(SENSITIVE_CATEGORIES).nullable(),
    })
    .strict(),
  z
    .object({ kind: z.literal('entity_match'), newCardId: z.uuid(), candidateCardId: z.uuid() })
    .strict(),
  z.object({ kind: z.literal('proposed_type'), typeId: z.uuid() }).strict(),
  z.object({ kind: z.literal('conflict'), factIds: z.tuple([z.uuid(), z.uuid()]) }).strict(), // [existant, nouveau]
]);
export type ReviewPayload = z.infer<typeof ReviewPayloadSchema>;
export type ReviewKind = ReviewPayload['kind'];

export async function createReviewItem(
  tx: Tx,
  ctx: TenantContext,
  payload: ReviewPayload,
  acl: string[],
): Promise<string> {
  const valid = ReviewPayloadSchema.parse(payload);
  const [item] = await tx
    .insert(reviewItems)
    .values({ tenantId: ctx.tenantId, kind: valid.kind, payload: valid, acl })
    .returning({ id: reviewItems.id });
  if (!item) throw new Error('élément « À vérifier » non créé');
  return item.id;
}
