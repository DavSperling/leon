import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { SENSITIVE_CATEGORIES } from '@/lib/enums';
import type { TenantContext } from '@/server/auth/tenant-context';
import {
  cardAliases,
  cards,
  cardTypes,
  factCandidates,
  facts,
  reviewItems,
} from '@/server/db/schema/memory';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { teamAcl } from './acl';
import { widenCardAcl } from './cards';
import { activateFact, wantedAcl } from './facts';

// Décisions « À vérifier ». L'ACL d'un fait n'est jamais calculée ici : elle passe par
// activateFact (facts.ts), qui applique l'ACL effective (D13). Ce module ne déplace un fait,
// ne change son statut ou ne ferme sa validité qu'en laissant son ACL intacte.

const ReviewPayloadSchema = z.discriminatedUnion('kind', [
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

export const ReviewResolutionSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('sensitive_fact'), decision: z.enum(['share', 'keep_private']) })
    .strict(),
  z.object({ kind: z.literal('entity_match'), decision: z.enum(['same', 'different']) }).strict(),
  z
    .object({ kind: z.literal('proposed_type'), decision: z.enum(['validate', 'use_parent']) })
    .strict(),
  z
    .object({
      kind: z.literal('conflict'),
      decision: z.enum(['keep_first', 'keep_second', 'both_wrong']),
    })
    .strict(),
]);
export type ReviewResolution = z.infer<typeof ReviewResolutionSchema>;
export type ResolveResult =
  | { ok: true }
  | { ok: false; reason: 'introuvable' | 'deja_traite' | 'incoherent' };

const OK: ResolveResult = { ok: true };
const INCOHERENT: ResolveResult = { ok: false, reason: 'incoherent' };

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

// Relit l'élément sous RLS : un élément invisible est « introuvable », jamais « interdit ».
export async function resolveReviewItem(
  ctx: TenantContext,
  itemId: string,
  resolution: ReviewResolution,
): Promise<ResolveResult> {
  return withTenant(ctx, async (tx) => {
    // FOR UPDATE : deux résolutions simultanées s'attendent, la seconde lit « resolved ».
    const [item] = await tx
      .select({ kind: reviewItems.kind, status: reviewItems.status, payload: reviewItems.payload })
      .from(reviewItems)
      .where(eq(reviewItems.id, itemId))
      .for('update');
    if (!item) return { ok: false, reason: 'introuvable' };
    if (item.status === 'resolved') return { ok: false, reason: 'deja_traite' };
    if (resolution.kind !== item.kind) return INCOHERENT;
    const result = await applyResolution(
      tx,
      ctx,
      ReviewPayloadSchema.parse(item.payload),
      resolution,
    );
    if (!result.ok) return result;
    await tx
      .update(reviewItems)
      .set({ status: 'resolved', resolution, resolvedBy: ctx.userId, resolvedAt: new Date() })
      .where(eq(reviewItems.id, itemId));
    return result;
  });
}

// Une résolution « incohérente » est rendue avant toute écriture.
async function applyResolution(
  tx: Tx,
  ctx: TenantContext,
  payload: ReviewPayload,
  resolution: ReviewResolution,
): Promise<ResolveResult> {
  if (payload.kind === 'sensitive_fact' && resolution.kind === 'sensitive_fact') {
    await resolveSensitiveFact(tx, ctx, payload.factId, resolution.decision);
    return OK;
  }
  if (payload.kind === 'entity_match' && resolution.kind === 'entity_match') {
    return resolveEntityMatch(tx, ctx, payload, resolution.decision);
  }
  if (payload.kind === 'proposed_type' && resolution.kind === 'proposed_type') {
    return resolveProposedType(tx, payload.typeId, resolution.decision);
  }
  if (payload.kind === 'conflict' && resolution.kind === 'conflict') {
    await resolveConflict(tx, ctx, payload.factIds, resolution.decision);
    return OK;
  }
  return INCOHERENT;
}

// share : l'ACL voulue passe d'abord à l'équipe (elle servira à la confirmation d'une fiche non
// confirmée), puis activateFact écrit l'ACL effective. keep_private : activé à son ACL voulue (privée).
async function resolveSensitiveFact(
  tx: Tx,
  ctx: TenantContext,
  factId: string,
  decision: 'share' | 'keep_private',
): Promise<void> {
  if (decision === 'keep_private') {
    await activateFact(tx, ctx, factId, await wantedAcl(tx, factId));
    return;
  }
  const team = teamAcl(ctx.tenantId);
  const [fact] = await tx
    .select({ candidateId: facts.candidateId })
    .from(facts)
    .where(eq(facts.id, factId));
  if (!fact) throw new Error('fait introuvable ou invisible');
  if (fact.candidateId) {
    const updated = await tx
      .update(factCandidates)
      .set({ factAcl: team })
      .where(eq(factCandidates.id, fact.candidateId))
      .returning({ id: factCandidates.id });
    if (updated.length === 0) throw new Error('candidat du fait invisible');
  }
  await activateFact(tx, ctx, factId, team);
}

async function resolveEntityMatch(
  tx: Tx,
  ctx: TenantContext,
  { newCardId, candidateCardId }: { newCardId: string; candidateCardId: string },
  decision: 'same' | 'different',
): Promise<ResolveResult> {
  const visible = await tx
    .select({ id: cards.id })
    .from(cards)
    .where(and(inArray(cards.id, [newCardId, candidateCardId]), isNull(cards.mergedInto)));
  if (visible.length !== 2) return INCOHERENT;
  if (decision === 'different') await confirmCard(tx, ctx, newCardId);
  else await mergeCard(tx, ctx, newCardId, candidateCardId);
  return OK;
}

// Les faits actifs prennent leur ACL voulue ; les faits à valider restent tels quels.
async function activateCardFacts(tx: Tx, ctx: TenantContext, factIds: string[]): Promise<void> {
  for (const id of factIds) await activateFact(tx, ctx, id, await wantedAcl(tx, id));
}

async function confirmCard(tx: Tx, ctx: TenantContext, cardId: string): Promise<void> {
  await tx.update(cards).set({ status: 'confirmed' }).where(eq(cards.id, cardId));
  const active = await tx
    .select({ id: facts.id })
    .from(facts)
    .where(and(eq(facts.cardId, cardId), eq(facts.status, 'active')));
  await activateCardFacts(
    tx,
    ctx,
    active.map((fact) => fact.id),
  );
}

// Les faits actifs passent `pending_review` en changeant de fiche : la contrainte EXCLUDE ne peut
// pas être franchie avant qu'activateFact ne les range face aux faits de la fiche candidate.
async function mergeCard(
  tx: Tx,
  ctx: TenantContext,
  cardId: string,
  targetId: string,
): Promise<void> {
  const moved = await tx
    .update(facts)
    .set({ cardId: targetId, status: 'pending_review' })
    .where(and(eq(facts.cardId, cardId), eq(facts.status, 'active')))
    .returning({ id: facts.id });
  await tx.update(facts).set({ cardId: targetId }).where(eq(facts.cardId, cardId));
  await activateCardFacts(
    tx,
    ctx,
    moved.map((fact) => fact.id),
  );
  await copyAliases(tx, ctx, cardId, targetId);
  await tx.update(cards).set({ mergedInto: targetId }).where(eq(cards.id, cardId));
}

// Chaque alias garde son ACL ; un alias déjà présent sur la fiche cible n'est pas dupliqué.
async function copyAliases(
  tx: Tx,
  ctx: TenantContext,
  cardId: string,
  targetId: string,
): Promise<void> {
  const aliases = await tx
    .select({ alias: cardAliases.alias, kind: cardAliases.kind, acl: cardAliases.acl })
    .from(cardAliases)
    .where(eq(cardAliases.cardId, cardId));
  if (aliases.length === 0) return;
  await tx
    .insert(cardAliases)
    .values(aliases.map((alias) => ({ tenantId: ctx.tenantId, cardId: targetId, ...alias })))
    .onConflictDoNothing();
}

async function resolveProposedType(
  tx: Tx,
  typeId: string,
  decision: 'validate' | 'use_parent',
): Promise<ResolveResult> {
  const isProposed = and(eq(cardTypes.id, typeId), eq(cardTypes.status, 'proposed'));
  if (decision === 'validate') {
    const updated = await tx
      .update(cardTypes)
      .set({ status: 'validated' })
      .where(isProposed)
      .returning({ id: cardTypes.id });
    return updated.length === 1 ? OK : INCOHERENT;
  }
  const [type] = await tx
    .select({ parentSlug: cardTypes.parentSlug })
    .from(cardTypes)
    .where(isProposed);
  if (!type?.parentSlug) return INCOHERENT;
  // Type visible de ce slug : celui du tenant l'emporte sur celui du socle.
  const [parent] = await tx
    .select({ id: cardTypes.id })
    .from(cardTypes)
    .where(eq(cardTypes.slug, type.parentSlug))
    .orderBy(sql`${cardTypes.tenantId} nulls last`)
    .limit(1);
  if (!parent) return INCOHERENT;
  const moved = await tx
    .update(cards)
    .set({ typeId: parent.id })
    .where(eq(cards.typeId, typeId))
    .returning({ id: cards.id, acl: cards.acl });
  // Une fiche visible a toujours un type visible (D13) : un parent propre au tenant suit ses fiches.
  for (const card of moved) await widenCardAcl(tx, card.id, card.acl);
  return OK;
}

// keep_first / keep_second : l'écarté est remplacé par le gardé, que activateFact réactive à son
// ACL actuelle (après la fermeture de l'écarté : règle 3 de facts.ts). both_wrong : les deux sont fermés.
async function resolveConflict(
  tx: Tx,
  ctx: TenantContext,
  [first, second]: [string, string],
  decision: 'keep_first' | 'keep_second' | 'both_wrong',
): Promise<void> {
  if (decision === 'both_wrong') {
    await retireFact(tx, first, null);
    await retireFact(tx, second, null);
    return;
  }
  const [kept, dropped] = decision === 'keep_first' ? [first, second] : [second, first];
  await retireFact(tx, dropped, kept);
  const [fact] = await tx.select({ acl: facts.acl }).from(facts).where(eq(facts.id, kept));
  if (!fact) throw new Error('fait introuvable ou invisible');
  await activateFact(tx, ctx, kept, fact.acl);
}

// Validité vide (valid_to = valid_from) : le fait n'a jamais été vrai ; il reste dans l'historique.
async function retireFact(tx: Tx, factId: string, supersededBy: string | null): Promise<void> {
  const retired = await tx
    .update(facts)
    .set({ status: 'superseded', supersededBy, validTo: sql`${facts.validFrom}` })
    .where(eq(facts.id, factId))
    .returning({ id: facts.id });
  if (retired.length === 0) throw new Error('fait introuvable ou invisible');
}
