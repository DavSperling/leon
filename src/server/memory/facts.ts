import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { SourceKind } from '@/capture/turn';
import type { CardStatus } from '@/lib/enums';
import type { TenantContext } from '@/server/auth/tenant-context';
import { cards, factCandidates, facts } from '@/server/db/schema/memory';
import type { Tx } from '@/server/db/with-tenant';
import { authorAcl, isTeamAcl, mostRestrictiveAcl } from './acl';
import { widenCardAcl } from './cards';
import { createReviewItem } from './review-item-write';

// Seul endroit qui écrit l'ACL d'un fait. Règles :
// 1. ACL effective (D13) : chaque écriture lit d'abord la fiche cible sous RLS (invisible ou absente
//    → erreur) ; fiche `unconfirmed` → ACL écrite [cards.created_by] et fiche non élargie ; sinon
//    ACL écrite = ACL demandée, puis widenCardAcl.
// 2. Activation : un fait ne devient `active` que par activateFact ; insertFact d'un statut `active`
//    insère en `pending_review` puis appelle activateFact dans la même transaction. Si le fait est
//    mono-valué et que son ACL effective est d'équipe, tout autre fait actif d'équipe de la même
//    fiche et du même prédicat dont la validité chevauche passe `conflict`, puis ce fait passe
//    `conflict`, avec un élément `conflict` par paire ; sinon il passe `active`.
// 3. Ordre des écritures : d'abord fermer ou passer en `conflict` l'ancien, ensuite insérer ou
//    activer le nouveau. La contrainte EXCLUDE n'est jamais violée par ce code : une violation vient
//    d'une écriture concurrente, la transaction échoue et pg-boss reprend.
// 4. D14 : supersedeFact et insertConflictingFact lèvent, avant d'écrire, si le fait existant ou
//    l'ACL effective du nouveau fait n'est pas d'équipe.
// 5. Les éléments `conflict` passent par createReviewItem (validation zod du payload).

export type NewFact = {
  cardId: string;
  predicate: string;
  statement: string;
  value: string | null;
  quote: string;
  quoteStart: number;
  quoteEnd: number;
  sourceId: string;
  turnId: string;
  sourceKind: SourceKind;
  authorId: string;
  validFrom: Date;
  validTo: Date | null;
  status: 'active' | 'pending_review';
  sensitivity: 'shareable' | 'sensitive';
  singleValued: boolean;
  confidence: number;
  acl: string[]; // ACL voulue ; l'ACL écrite est l'ACL effective (D13)
  candidateId: string | null;
};
export type ActiveFact = {
  id: string;
  statement: string;
  validFrom: Date;
  validTo: Date | null;
  acl: string[];
  singleValued: boolean;
};

const isTeamFact = sql`${facts.acl} @> array[${facts.tenantId}]`;

type TargetCard = { status: CardStatus; createdBy: string | null };

async function readCard(tx: Tx, cardId: string): Promise<TargetCard> {
  const [card] = await tx
    .select({ status: cards.status, createdBy: cards.createdBy })
    .from(cards)
    .where(eq(cards.id, cardId));
  if (!card) throw new Error('fiche introuvable ou invisible');
  return card;
}

function effectiveAcl(card: TargetCard, wanted: string[]): string[] {
  if (card.status === 'confirmed') return wanted;
  if (!card.createdBy) throw new Error('fiche non confirmée sans créateur');
  return authorAcl(card.createdBy);
}

// Règle 1 : calcule l'ACL écrite et élargit la fiche si elle est confirmée.
async function applyEffectiveAcl(tx: Tx, cardId: string, wanted: string[]): Promise<string[]> {
  const card = await readCard(tx, cardId);
  const acl = effectiveAcl(card, wanted);
  if (card.status === 'confirmed') await widenCardAcl(tx, cardId, acl);
  return acl;
}

async function insertRow(
  tx: Tx,
  ctx: TenantContext,
  { acl: wanted, status: _wantedStatus, ...fact }: NewFact,
  status: 'pending_review' | 'conflict',
): Promise<{ id: string; acl: string[] }> {
  const acl = await applyEffectiveAcl(tx, fact.cardId, wanted);
  const [row] = await tx
    .insert(facts)
    .values({ ...fact, tenantId: ctx.tenantId, status, acl })
    .returning({ id: facts.id });
  if (!row) throw new Error('fait non inséré');
  return { id: row.id, acl };
}

// D14, avant toute écriture : le fait existant est visible et d'équipe, et l'ACL effective du
// nouveau fait l'est aussi (sinon un fait privé ferait perdre sa valeur à l'équipe et trahirait
// son existence). Renvoie le fait existant.
async function assertTeamPair(tx: Tx, ctx: TenantContext, existingId: string, fact: NewFact) {
  const [existing] = await tx
    .select({ validFrom: facts.validFrom, acl: facts.acl })
    .from(facts)
    .where(eq(facts.id, existingId));
  if (!existing) throw new Error('fait introuvable ou invisible');
  if (!isTeamAcl(existing.acl, ctx.tenantId)) throw new Error("fait existant hors de l'équipe");
  const acl = effectiveAcl(await readCard(tx, fact.cardId), fact.acl);
  if (!isTeamAcl(acl, ctx.tenantId)) throw new Error("nouveau fait hors de l'équipe");
  return existing;
}

// Lit la fiche sous RLS (invisible ou absente → erreur), écrit l'ACL effective ; un statut 'active' passe par activateFact.
export async function insertFact(tx: Tx, ctx: TenantContext, fact: NewFact): Promise<string> {
  const { id } = await insertRow(tx, ctx, fact, 'pending_review');
  if (fact.status === 'active') await activateFact(tx, ctx, id, fact.acl);
  return id;
}

export async function findActiveTeamFacts(
  tx: Tx,
  cardId: string,
  predicate: string,
): Promise<ActiveFact[]> {
  return tx
    .select({
      id: facts.id,
      statement: facts.statement,
      validFrom: facts.validFrom,
      validTo: facts.validTo,
      acl: facts.acl,
      singleValued: facts.singleValued,
    })
    .from(facts)
    .where(
      and(
        eq(facts.cardId, cardId),
        eq(facts.predicate, predicate),
        eq(facts.status, 'active'),
        isTeamFact,
      ),
    )
    .orderBy(desc(facts.validFrom), facts.id);
}

// ACL voulue (D13) : fact_candidates.fact_acl du candidat, sinon l'ACL actuelle du fait.
export async function wantedAcl(tx: Tx, factId: string): Promise<string[]> {
  const [fact] = await tx
    .select({ acl: facts.acl, factAcl: factCandidates.factAcl })
    .from(facts)
    .leftJoin(factCandidates, eq(factCandidates.id, facts.candidateId))
    .where(eq(facts.id, factId));
  if (!fact) throw new Error('fait introuvable ou invisible');
  return fact.factAcl ?? fact.acl;
}

export async function supersedeFact(
  tx: Tx,
  ctx: TenantContext,
  oldFactId: string,
  fact: NewFact,
): Promise<string> {
  const old = await assertTeamPair(tx, ctx, oldFactId, fact);
  const validTo = old.validFrom > fact.validFrom ? old.validFrom : fact.validFrom;
  await tx.update(facts).set({ status: 'superseded', validTo }).where(eq(facts.id, oldFactId));
  const newId = await insertFact(tx, ctx, fact);
  await tx.update(facts).set({ supersededBy: newId }).where(eq(facts.id, oldFactId));
  return newId;
}

export async function insertConflictingFact(
  tx: Tx,
  ctx: TenantContext,
  existingFactId: string,
  fact: NewFact,
): Promise<{ factId: string; reviewItemId: string }> {
  const existing = await assertTeamPair(tx, ctx, existingFactId, fact);
  await tx.update(facts).set({ status: 'conflict' }).where(eq(facts.id, existingFactId));
  const inserted = await insertRow(tx, ctx, fact, 'conflict');
  const acl = mostRestrictiveAcl([existing.acl, inserted.acl], ctx.tenantId);
  const reviewItemId = await createReviewItem(
    tx,
    ctx,
    { kind: 'conflict', factIds: [existingFactId, inserted.id] },
    acl,
  );
  return { factId: inserted.id, reviewItemId };
}

// Règle 2 : passe en `conflict` les faits actifs d'équipe qui chevauchent ce fait.
async function conflictOverlappingTeamFacts(
  tx: Tx,
  fact: { id: string; cardId: string; predicate: string; validFrom: Date; validTo: Date | null },
): Promise<Array<{ id: string; acl: string[] }>> {
  return tx
    .update(facts)
    .set({ status: 'conflict' })
    .where(
      and(
        eq(facts.cardId, fact.cardId),
        eq(facts.predicate, fact.predicate),
        eq(facts.status, 'active'),
        eq(facts.singleValued, true),
        isTeamFact,
        ne(facts.id, fact.id),
        sql`validity && tstzrange(${fact.validFrom}::timestamptz, ${fact.validTo}::timestamptz, '[)')`,
      ),
    )
    .returning({ id: facts.id, acl: facts.acl });
}

export async function activateFact(
  tx: Tx,
  ctx: TenantContext,
  factId: string,
  acl: string[],
): Promise<'active' | 'conflict'> {
  const [fact] = await tx
    .select({
      id: facts.id,
      cardId: facts.cardId,
      predicate: facts.predicate,
      validFrom: facts.validFrom,
      validTo: facts.validTo,
      singleValued: facts.singleValued,
    })
    .from(facts)
    .where(eq(facts.id, factId));
  if (!fact) throw new Error('fait introuvable ou invisible');
  const effective = await applyEffectiveAcl(tx, fact.cardId, acl);
  const overlapping =
    fact.singleValued && isTeamAcl(effective, ctx.tenantId)
      ? await conflictOverlappingTeamFacts(tx, fact)
      : [];
  const status = overlapping.length > 0 ? 'conflict' : 'active';
  await tx.update(facts).set({ status, acl: effective }).where(eq(facts.id, factId));
  for (const other of overlapping) {
    const itemAcl = mostRestrictiveAcl([other.acl, effective], ctx.tenantId);
    await createReviewItem(tx, ctx, { kind: 'conflict', factIds: [other.id, factId] }, itemAcl);
  }
  return status;
}
