import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { SourceKind } from '@/capture/turn';
import type { CardStatus } from '@/lib/enums';
import { slugify } from '@/lib/slug';
import type { TenantContext } from '@/server/auth/tenant-context';
import { cards, cardTypes, factCandidates, facts, sources, turns } from '@/server/db/schema/memory';
import type { Tx } from '@/server/db/with-tenant';
import { authorAcl, isTeamAcl } from '@/server/memory/acl';
import { addCardAliases, createCard } from '@/server/memory/cards';
import { createProposedType, predicatesForType } from '@/server/memory/catalog';
import {
  insertConflictingFact,
  insertFact,
  type NewFact,
  supersedeFact,
} from '@/server/memory/facts';
import { createReviewItem } from '@/server/memory/review-item-write';
import type { FactCandidateRow, PlacementContext } from './context';
import type { PlacementAction, TypeChoice } from './plan';

// Écrit le plan validé par planPlacement, dans la transaction de l'auteur. apply.ts choisit la fiche,
// le type, le statut et la relation ; facts.ts calcule l'ACL écrite de chaque fait (D13, D14).

type PlaceAction = Extract<PlacementAction, { kind: 'place' }>;
type NewTarget = Extract<PlaceAction['target'], { kind: 'new' }>;
type Evidence = { sourceId: string; sourceKind: SourceKind; ts: Date };
type Target = { cardId: string; typeSlug: string };

// Fiches et types créés par les actions précédentes du même rangement : un titre, un type, une fiche.
type ApplyState = {
  tx: Tx;
  ctx: TenantContext;
  context: PlacementContext;
  evidence: Map<string, Evidence>;
  newCards: Map<string, string>;
  proposedTypes: Map<string, string>;
};

async function loadEvidence(tx: Tx, turnIds: string[]): Promise<Map<string, Evidence>> {
  if (turnIds.length === 0) return new Map();
  const rows = await tx
    .select({ turnId: turns.id, ts: turns.ts, sourceId: sources.id, sourceKind: sources.kind })
    .from(turns)
    .innerJoin(sources, eq(sources.id, turns.sourceId))
    .where(inArray(turns.id, turnIds));
  return new Map(rows.map(({ turnId, ...evidence }) => [turnId, evidence]));
}

async function rejectCandidate(tx: Tx, candidateId: string, reason: string): Promise<void> {
  await tx
    .update(factCandidates)
    .set({ status: 'rejected', rejectionReason: reason })
    .where(eq(factCandidates.id, candidateId));
}

// Un type proposé n'est créé qu'une fois par rangement ; null si le slug est déjà pris par un type
// invisible de l'auteur.
async function proposeType(
  state: ApplyState,
  type: Extract<TypeChoice, { kind: 'proposed' }>,
  acl: string[],
): Promise<string | null> {
  const known = state.proposedTypes.get(type.slug);
  if (known) return known;
  const created = await createProposedType(state.tx, state.ctx, { ...type, acl });
  if (!created) return null;
  await createReviewItem(state.tx, state.ctx, { kind: 'proposed_type', typeId: created.id }, acl);
  state.proposedTypes.set(type.slug, created.id);
  return created.id;
}

function catalogTypeId(state: ApplyState, slug: string): string {
  const catalogType = state.context.catalog.types.find((t) => t.slug === slug);
  if (!catalogType) throw new Error('type de fiche absent du catalogue');
  return catalogType.id;
}

// Le rangement n'élargit jamais un type privé : une fiche d'équipe ne porte qu'un type d'équipe,
// sinon createCard ou widenCardAcl élargiraient son type, et un libellé né d'un candidat privé
// deviendrait visible de tous. Renvoie le type parent du socle à prendre à la place d'un type
// propre au tenant qui n'est pas d'équipe ; null si typeId peut rester.
async function teamFallbackTypeId(state: ApplyState, typeId: string): Promise<string | null> {
  const [tenantType] = await state.tx
    .select({ acl: cardTypes.acl, parentSlug: cardTypes.parentSlug })
    .from(cardTypes)
    .where(and(eq(cardTypes.id, typeId), isNotNull(cardTypes.tenantId)));
  if (!tenantType?.parentSlug || isTeamAcl(tenantType.acl ?? [], state.ctx.tenantId)) return null;
  return catalogTypeId(state, tenantType.parentSlug);
}

// Sans type proposé utilisable, la fiche prend le type parent ; une fiche d'équipe le prend aussi
// à la place d'un type privé.
async function typeIdFor(state: ApplyState, type: TypeChoice, acl: string[]): Promise<string> {
  const proposedId = type.kind === 'proposed' ? await proposeType(state, type, acl) : null;
  const typeId =
    proposedId ?? catalogTypeId(state, type.kind === 'proposed' ? type.parentSlug : type.slug);
  if (!isTeamAcl(acl, state.ctx.tenantId)) return typeId;
  return (await teamFallbackTypeId(state, typeId)) ?? typeId;
}

// Une fiche qui va recevoir un fait d'équipe passe sous le type parent si son type est privé :
// facts.ts élargira la fiche, et le type resterait sinon à élargir avec elle. Vaut pour une fiche
// existante comme pour une fiche privée créée plus tôt dans le même rangement.
async function keepTypePrivate(state: ApplyState, cardId: string): Promise<void> {
  const [card] = await state.tx
    .select({ typeId: cards.typeId })
    .from(cards)
    .where(eq(cards.id, cardId));
  if (!card) throw new Error('fiche introuvable ou invisible');
  const fallbackId = await teamFallbackTypeId(state, card.typeId);
  if (fallbackId) {
    await state.tx.update(cards).set({ typeId: fallbackId }).where(eq(cards.id, cardId));
  }
}

async function newCardId(state: ApplyState, target: NewTarget, acl: string[]): Promise<string> {
  const match = target.unconfirmedMatchCardId;
  const key = [slugify(target.title), target.type.slug, match ?? 'confirmée'].join('|');
  const existing = state.newCards.get(key);
  if (existing) return existing;
  const cardId = await createCard(state.tx, state.ctx, {
    typeId: await typeIdFor(state, target.type, acl),
    title: target.title,
    status: match ? 'unconfirmed' : 'confirmed',
    acl,
  });
  if (match) {
    const payload = { kind: 'entity_match' as const, newCardId: cardId, candidateCardId: match };
    await createReviewItem(state.tx, state.ctx, payload, acl);
  }
  state.newCards.set(key, cardId);
  return cardId;
}

// Statut et type de la fiche cible, sans rien écrire : l'ACL de l'action en dépend.
function describeTarget(state: ApplyState, candidateId: string, action: PlaceAction) {
  const { target } = action;
  if (target.kind === 'new') {
    const typeSlug = target.type.kind === 'proposed' ? target.type.parentSlug : target.type.slug;
    const status: CardStatus = target.unconfirmedMatchCardId ? 'unconfirmed' : 'confirmed';
    return { status, typeSlug };
  }
  const option = state.context.candidates
    .find((candidate) => candidate.candidateId === candidateId)
    ?.cardOptions.find((card) => card.id === target.cardId);
  if (!option) throw new Error('fiche absente du contexte');
  return { status: option.status, typeSlug: option.typeSlug };
}

function newFact(state: ApplyState, row: FactCandidateRow, target: Target, predicate: string) {
  const evidence = state.evidence.get(row.turnId);
  if (!evidence) throw new Error('tour du candidat introuvable');
  if (row.quoteStart === null || row.quoteEnd === null) throw new Error('candidat sans citation');
  const singleValued = predicatesForType(state.context.catalog, target.typeSlug).some(
    (p) => p.slug === predicate && p.singleValued,
  );
  return {
    cardId: target.cardId,
    predicate,
    statement: row.statement,
    value: row.value,
    quote: row.quote,
    quoteStart: row.quoteStart,
    quoteEnd: row.quoteEnd,
    sourceId: evidence.sourceId,
    turnId: row.turnId,
    sourceKind: evidence.sourceKind,
    authorId: state.ctx.userId,
    validFrom: row.validFrom ?? evidence.ts,
    validTo: row.validTo,
    sensitivity: row.sensitivity,
    singleValued,
    confidence: row.confidence,
    acl: row.factAcl, // ACL voulue : facts.ts écrit l'ACL effective
    candidateId: row.id,
  } satisfies Omit<NewFact, 'status'>;
}

// Un fait sensible attend la décision de son auteur : sa relation aux faits d'équipe est ignorée.
async function writeSensitiveFact(
  state: ApplyState,
  row: FactCandidateRow,
  fact: NewFact,
  acl: string[],
) {
  const factId = await insertFact(state.tx, state.ctx, fact);
  const payload = { kind: 'sensitive_fact' as const, factId, category: row.sensitiveCategory };
  await createReviewItem(state.tx, state.ctx, payload, acl);
}

async function isActiveFact(tx: Tx, factId: string): Promise<boolean> {
  const [fact] = await tx
    .select({ status: facts.status })
    .from(facts)
    .where(eq(facts.id, factId))
    .for('update');
  return fact?.status === 'active';
}

// Le contexte est figé avant l'écriture : une action précédente du même rangement, ou un rangement
// concurrent, a pu fermer ou mettre en contradiction le fait visé. Le fait s'écrit alors comme
// nouveau, et la règle d'activation de facts.ts le range face aux faits encore actifs.
async function writeRelatedFact(
  state: ApplyState,
  relation: PlaceAction['relation'],
  fact: NewFact,
) {
  const { tx, ctx } = state;
  const targetId =
    relation.kind === 'supersedes' || relation.kind === 'contradicts' ? relation.factId : null;
  if (!targetId || !(await isActiveFact(tx, targetId))) await insertFact(tx, ctx, fact);
  else if (relation.kind === 'supersedes') await supersedeFact(tx, ctx, relation.factId, fact);
  else if (relation.kind === 'contradicts')
    await insertConflictingFact(tx, ctx, relation.factId, fact);
}

// ACL de l'action (D13) : [auteur] si le candidat est sensible ou la fiche non confirmée, sinon l'ACL
// voulue du fait ; toute ligne dérivée de l'action (fiche, type, alias, éléments) la prend.
async function placeCandidate(state: ApplyState, row: FactCandidateRow, action: PlaceAction) {
  const sensitive = row.sensitivity === 'sensitive';
  const { relation } = action;
  if (!sensitive && relation.kind === 'duplicate') {
    return rejectCandidate(state.tx, row.id, `doublon de ${relation.factId}`);
  }
  const { status, typeSlug } = describeTarget(state, row.id, action);
  const acl = sensitive || status === 'unconfirmed' ? authorAcl(state.ctx.userId) : row.factAcl;
  const { target } = action;
  const cardId = target.kind === 'existing' ? target.cardId : await newCardId(state, target, acl);
  if (isTeamAcl(acl, state.ctx.tenantId)) await keepTypePrivate(state, cardId);
  await addCardAliases(state.tx, state.ctx, cardId, action.aliases, acl);
  const fact = newFact(state, row, { cardId, typeSlug }, action.predicate);
  if (sensitive) await writeSensitiveFact(state, row, { ...fact, status: 'pending_review' }, acl);
  else await writeRelatedFact(state, relation, { ...fact, status: 'active' });
  await state.tx
    .update(factCandidates)
    .set({ status: 'placed' })
    .where(eq(factCandidates.id, row.id));
}

export async function applyPlacement(
  tx: Tx,
  ctx: TenantContext,
  context: PlacementContext,
  candidates: FactCandidateRow[],
  actions: PlacementAction[],
): Promise<void> {
  const rows = new Map(candidates.map((row) => [row.id, row]));
  const evidence = await loadEvidence(tx, [...new Set(candidates.map((row) => row.turnId))]);
  const state: ApplyState = {
    tx,
    ctx,
    context,
    evidence,
    newCards: new Map(),
    proposedTypes: new Map(),
  };
  for (const action of actions) {
    const row = rows.get(action.candidateId);
    if (!row) throw new Error('candidat absent du rangement');
    if (action.kind === 'reject') await rejectCandidate(tx, row.id, action.reason);
    else await placeCandidate(state, row, action);
  }
}
