import { and, eq, inArray, isNull, sql, TransactionRollbackError } from 'drizzle-orm';
import { z } from 'zod';
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
import { type ReviewPayload, ReviewPayloadSchema } from './review-item-write';

// Décisions « À vérifier ». L'ACL d'un fait n'est jamais calculée ici : elle passe par
// activateFact (facts.ts), qui applique l'ACL effective (D13). Ce module ne déplace un fait,
// ne change son statut ou ne ferme sa validité qu'en laissant son ACL intacte.

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
// Résolution des éléments clos sans décision, parce qu'une autre décision les a rendus sans objet.
const OBSOLETE = { kind: 'obsolete' } as const;
const INCOHERENT: ResolveResult = { ok: false, reason: 'incoherent' };

// Les décisions d'un tenant passent l'une après l'autre (verrou consultatif de transaction) : une
// décision clôt des éléments et réactive des faits que la suivante relit ; sans ce verrou, deux
// décisions qui se croisent (l'une tient l'élément, l'autre le fait) s'interbloqueraient.
// Passe d'abord l'élément de `open` à `resolved` (mise à jour conditionnelle : un élément déjà traité
// ou devenu sans objet n'est plus ouvert), puis applique la décision. Une précondition d'état qui ne
// tient plus annule toute la transaction : « incohérent ». Les préconditions verrouillent aussi les
// lignes qu'elles lisent, face aux écritures concurrentes du pipeline.
export async function resolveReviewItem(
  ctx: TenantContext,
  itemId: string,
  input: ReviewResolution,
): Promise<ResolveResult> {
  const resolution = ReviewResolutionSchema.parse(input);
  try {
    return await withTenant(ctx, async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('review_items'), hashtext(${ctx.tenantId}))`,
      );
      const [item] = await tx
        .update(reviewItems)
        .set({ status: 'resolved', resolution, resolvedBy: ctx.userId, resolvedAt: new Date() })
        .where(and(eq(reviewItems.id, itemId), eq(reviewItems.status, 'open')))
        .returning({ payload: reviewItems.payload });
      if (!item) return unclaimedReason(tx, itemId);
      const payload = ReviewPayloadSchema.parse(item.payload);
      if (!(await applyResolution(tx, ctx, payload, resolution))) tx.rollback();
      await settleAfterDecision(tx, ctx, payload);
      return OK;
    });
  } catch (error) {
    if (error instanceof TransactionRollbackError) return INCOHERENT;
    throw error;
  }
}

// Relu sous RLS : un élément invisible est « introuvable », jamais « interdit ».
async function unclaimedReason(tx: Tx, itemId: string): Promise<ResolveResult> {
  const [item] = await tx
    .select({ id: reviewItems.id })
    .from(reviewItems)
    .where(eq(reviewItems.id, itemId));
  return { ok: false, reason: item ? 'deja_traite' : 'introuvable' };
}

// Après une décision : clôt les éléments devenus sans objet, puis rend actif chaque fait sorti de la
// décision (gardé, ou partenaire d'un élément clos) qui n'est plus cité par aucun élément `conflict`
// ouvert ; activateFact revérifie ses chevauchements.
async function settleAfterDecision(
  tx: Tx,
  ctx: TenantContext,
  payload: ReviewPayload,
): Promise<void> {
  const closed = await closeObsoleteItems(tx, ctx);
  const released = [payload, ...closed].flatMap((p) => (p.kind === 'conflict' ? p.factIds : []));
  for (const factId of new Set(released)) await releaseFact(tx, ctx, factId);
}

// Un élément ouvert est sans objet quand sa décision ne peut plus s'appliquer : un de ses faits est
// écarté (conflict), son fait est déjà tranché (sensitive_fact), sa nouvelle fiche est confirmée ou
// une de ses fiches fusionnée (entity_match), son type est validé (proposed_type). Conditions
// positives : sous la RLS, un fait ou une fiche invisible ne rend jamais un élément sans objet.
async function closeObsoleteItems(tx: Tx, ctx: TenantContext): Promise<ReviewPayload[]> {
  const { rows } = await tx.execute<{ payload: unknown }>(sql`
    update review_items ri
    set status = 'resolved', resolution = ${JSON.stringify(OBSOLETE)}::jsonb,
      resolved_by = ${ctx.userId}, resolved_at = now()
    where ri.status = 'open' and case ri.kind
      when 'conflict' then exists (select 1 from facts f where f.status = 'superseded'
        and f.id in ((ri.payload #>> '{factIds,0}')::uuid, (ri.payload #>> '{factIds,1}')::uuid))
      when 'sensitive_fact' then exists (select 1 from facts f where f.status <> 'pending_review'
        and f.id = (ri.payload ->> 'factId')::uuid)
      when 'entity_match' then exists (select 1 from cards c
        where (c.id = (ri.payload ->> 'newCardId')::uuid and c.status = 'confirmed')
          or (c.merged_into is not null and c.id in
            ((ri.payload ->> 'newCardId')::uuid, (ri.payload ->> 'candidateCardId')::uuid)))
      when 'proposed_type' then exists (select 1 from card_types t where t.status = 'validated'
        and t.id = (ri.payload ->> 'typeId')::uuid)
    end
    returning ri.payload`);
  return rows.map((row) => ReviewPayloadSchema.parse(row.payload));
}

async function releaseFact(tx: Tx, ctx: TenantContext, factId: string): Promise<void> {
  const [fact] = await tx
    .select({ acl: facts.acl })
    .from(facts)
    .where(and(eq(facts.id, factId), eq(facts.status, 'conflict')));
  if (!fact) return;
  const [live] = await tx
    .select({ id: reviewItems.id })
    .from(reviewItems)
    .where(
      and(
        eq(reviewItems.status, 'open'),
        eq(reviewItems.kind, 'conflict'),
        sql`${reviewItems.payload} -> 'factIds' @> ${JSON.stringify([factId])}::jsonb`,
      ),
    )
    .limit(1);
  if (!live) await activateFact(tx, ctx, factId, fact.acl);
}

// Inatteignable après ReviewResolutionSchema.parse ; `never` garde les switch exhaustifs.
const unknownDecision = (_decision: never) => new Error('décision inconnue');

// false : la décision ne s'applique pas à cet élément, ou son état a changé depuis sa création.
async function applyResolution(
  tx: Tx,
  ctx: TenantContext,
  payload: ReviewPayload,
  resolution: ReviewResolution,
): Promise<boolean> {
  switch (resolution.kind) {
    case 'sensitive_fact':
      if (payload.kind !== 'sensitive_fact') return false;
      return resolveSensitiveFact(tx, ctx, payload.factId, resolution.decision);
    case 'entity_match':
      if (payload.kind !== 'entity_match') return false;
      return resolveEntityMatch(tx, ctx, payload, resolution.decision);
    case 'proposed_type':
      if (payload.kind !== 'proposed_type') return false;
      return resolveProposedType(tx, payload.typeId, resolution.decision);
    case 'conflict':
      if (payload.kind !== 'conflict') return false;
      return resolveConflict(tx, payload.factIds, resolution.decision);
    default:
      throw unknownDecision(resolution);
  }
}

// share : l'ACL voulue passe d'abord à l'équipe (elle servira à la confirmation d'une fiche non
// confirmée), puis activateFact écrit l'ACL effective. keep_private : activé à son ACL voulue (privée).
async function resolveSensitiveFact(
  tx: Tx,
  ctx: TenantContext,
  factId: string,
  decision: 'share' | 'keep_private',
): Promise<boolean> {
  const [fact] = await tx
    .select({ candidateId: facts.candidateId })
    .from(facts)
    .where(and(eq(facts.id, factId), eq(facts.status, 'pending_review')))
    .for('update');
  if (!fact) return false;
  switch (decision) {
    case 'keep_private':
      await activateFact(tx, ctx, factId, await wantedAcl(tx, factId));
      return true;
    case 'share':
      await shareFact(tx, ctx, factId, fact.candidateId);
      return true;
    default:
      throw unknownDecision(decision);
  }
}

async function shareFact(
  tx: Tx,
  ctx: TenantContext,
  factId: string,
  candidateId: string | null,
): Promise<void> {
  const team = teamAcl(ctx.tenantId);
  if (candidateId) {
    const updated = await tx
      .update(factCandidates)
      .set({ factAcl: team })
      .where(eq(factCandidates.id, candidateId))
      .returning({ id: factCandidates.id });
    if (updated.length === 0) throw new Error('candidat du fait invisible');
  }
  await activateFact(tx, ctx, factId, team);
}

// La fiche nouvelle doit être encore non confirmée ; les deux fiches visibles et non fusionnées.
async function resolveEntityMatch(
  tx: Tx,
  ctx: TenantContext,
  { newCardId, candidateCardId }: { newCardId: string; candidateCardId: string },
  decision: 'same' | 'different',
): Promise<boolean> {
  const visible = await tx
    .select({ id: cards.id, status: cards.status })
    .from(cards)
    .where(and(inArray(cards.id, [newCardId, candidateCardId]), isNull(cards.mergedInto)))
    .for('update');
  const newCard = visible.find((card) => card.id === newCardId);
  if (visible.length !== 2 || newCard?.status !== 'unconfirmed') return false;
  switch (decision) {
    case 'different':
      await confirmCard(tx, ctx, newCardId);
      return true;
    case 'same':
      await mergeCard(tx, ctx, newCardId, candidateCardId);
      return true;
    default:
      throw unknownDecision(decision);
  }
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

// Le type doit être encore proposé (et visible).
async function resolveProposedType(
  tx: Tx,
  typeId: string,
  decision: 'validate' | 'use_parent',
): Promise<boolean> {
  const [type] = await tx
    .select({ parentSlug: cardTypes.parentSlug })
    .from(cardTypes)
    .where(and(eq(cardTypes.id, typeId), eq(cardTypes.status, 'proposed')));
  if (!type) return false;
  switch (decision) {
    case 'validate':
      await tx.update(cardTypes).set({ status: 'validated' }).where(eq(cardTypes.id, typeId));
      return true;
    case 'use_parent':
      if (!type.parentSlug) return false;
      return moveCardsToParent(tx, typeId, type.parentSlug);
    default:
      throw unknownDecision(decision);
  }
}

async function moveCardsToParent(tx: Tx, typeId: string, parentSlug: string): Promise<boolean> {
  // Type visible de ce slug : celui du tenant l'emporte sur celui du socle.
  const [parent] = await tx
    .select({ id: cardTypes.id })
    .from(cardTypes)
    .where(eq(cardTypes.slug, parentSlug))
    .orderBy(sql`${cardTypes.tenantId} nulls last`)
    .limit(1);
  if (!parent) return false;
  const moved = await tx
    .update(cards)
    .set({ typeId: parent.id })
    .where(eq(cards.typeId, typeId))
    .returning({ id: cards.id, acl: cards.acl });
  // Une fiche visible a toujours un type visible (D13) : un parent propre au tenant suit ses fiches.
  for (const card of moved) await widenCardAcl(tx, card.id, card.acl);
  return true;
}

// Les deux faits doivent être encore en contradiction : un fait déjà écarté ne redevient jamais
// actif. keep_first / keep_second : l'écarté est remplacé par le gardé ; both_wrong : les deux sont
// fermés. Le gardé redevient actif ensuite, dans settleAfterDecision, s'il n'est plus contredit.
async function resolveConflict(
  tx: Tx,
  [first, second]: [string, string],
  decision: 'keep_first' | 'keep_second' | 'both_wrong',
): Promise<boolean> {
  const inConflict = await tx
    .select({ id: facts.id })
    .from(facts)
    .where(and(inArray(facts.id, [first, second]), eq(facts.status, 'conflict')))
    .for('update');
  if (inConflict.length !== 2) return false;
  switch (decision) {
    case 'both_wrong':
      await retireFact(tx, first, null);
      await retireFact(tx, second, null);
      return true;
    case 'keep_first':
    case 'keep_second': {
      const [kept, dropped] = decision === 'keep_first' ? [first, second] : [second, first];
      await retireFact(tx, dropped, kept);
      return true;
    }
    default:
      throw unknownDecision(decision);
  }
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
