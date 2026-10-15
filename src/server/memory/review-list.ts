import { and, asc, count, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { users } from '@/server/db/schema/auth';
import { cards, cardTypes, facts, reviewItems, turns } from '@/server/db/schema/memory';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { type Catalog, loadCatalog, predicatesForType } from './catalog';
import { factAuthorName, SENSITIVE_CATEGORY_LABELS, SOURCE_KIND_LABELS } from './labels';
import { type ReviewPayload, ReviewPayloadSchema } from './review-item-write';
import { type ReviewResolution, ReviewResolutionSchema } from './review-items';

// Liste de l'interface « À vérifier » : une seule transaction, lectures sous la RLS du lecteur (D8).
// Un élément dont une ligne référencée n'est pas visible est omis : il ne lève jamais.

export type FactBrief = {
  id: string;
  statement: string;
  quote: string;
  authorName: string;
  validFrom: Date;
  sourceKindLabel: string;
};
export type CardBrief = {
  id: string;
  title: string;
  typeLabel: string;
  factCount: number;
  firstFact: FactBrief | null;
};
export type ReviewItemView = {
  id: string;
  status: 'open' | 'resolved';
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedByName: string | null;
  resolution: ReviewResolution | { kind: 'obsolete' } | null; // obsolete : clos sans décision (T08d)
  detail:
    | {
        kind: 'sensitive_fact';
        fact: FactBrief;
        cardId: string;
        cardTitle: string;
        categoryLabel: string | null;
      }
    | { kind: 'entity_match'; newCard: CardBrief; candidateCard: CardBrief }
    | {
        kind: 'proposed_type';
        type: { id: string; slug: string; label: string; parentLabel: string };
        cardCount: number;
      }
    | {
        kind: 'conflict';
        cardId: string;
        cardTitle: string;
        predicateLabel: string;
        facts: [FactBrief, FactBrief];
      };
};
type Detail = ReviewItemView['detail'];

const DEFAULT_LIMIT = 50;
const StoredResolutionSchema = z.union([
  ReviewResolutionSchema,
  z.object({ kind: z.literal('obsolete') }).strict(),
]);

export async function listReviewItems(
  ctx: TenantContext,
  input: { status: 'open' | 'resolved'; limit?: number },
): Promise<ReviewItemView[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await readItems(tx, input.status, input.limit ?? DEFAULT_LIMIT);
    const catalog = await loadCatalog(tx);
    const views: ReviewItemView[] = [];
    for (const { payload, resolution, ...row } of rows) {
      const parsed = ReviewPayloadSchema.safeParse(payload);
      const detail = parsed.success ? await describe(tx, catalog, parsed.data) : null;
      if (detail) {
        views.push({
          ...row,
          resolution: resolution ? StoredResolutionSchema.parse(resolution) : null,
          detail,
        });
      }
    }
    return views;
  });
}

function readItems(tx: Tx, status: 'open' | 'resolved', limit: number) {
  return tx
    .select({
      id: reviewItems.id,
      status: reviewItems.status,
      createdAt: reviewItems.createdAt,
      resolvedAt: reviewItems.resolvedAt,
      resolvedByName: users.name,
      resolution: reviewItems.resolution,
      payload: reviewItems.payload,
    })
    .from(reviewItems)
    .leftJoin(users, eq(users.id, reviewItems.resolvedBy))
    .where(eq(reviewItems.status, status))
    .orderBy(
      desc(status === 'open' ? reviewItems.createdAt : reviewItems.resolvedAt),
      asc(reviewItems.id),
    )
    .limit(limit);
}

async function describe(tx: Tx, catalog: Catalog, payload: ReviewPayload): Promise<Detail | null> {
  switch (payload.kind) {
    case 'sensitive_fact':
      return describeSensitiveFact(tx, payload);
    case 'entity_match':
      return describeEntityMatch(tx, payload);
    case 'proposed_type':
      return describeProposedType(tx, catalog, payload.typeId);
    case 'conflict':
      return describeConflict(tx, catalog, payload.factIds);
  }
}

type FactRow = FactBrief & { cardId: string; predicate: string };

async function readFact(tx: Tx, factId: string): Promise<FactRow | null> {
  const [row] = await tx
    .select({
      id: facts.id,
      cardId: facts.cardId,
      predicate: facts.predicate,
      statement: facts.statement,
      quote: facts.quote,
      userName: users.name,
      turnAuthorName: turns.authorName,
      validFrom: facts.validFrom,
      sourceKind: facts.sourceKind,
    })
    .from(facts)
    .innerJoin(users, eq(users.id, facts.authorId))
    .leftJoin(turns, eq(turns.id, facts.turnId))
    .where(eq(facts.id, factId));
  if (!row) return null;
  const { sourceKind, userName, turnAuthorName, ...fact } = row;
  return {
    ...fact,
    authorName: factAuthorName({ sourceKind, userName, turnAuthorName }),
    sourceKindLabel: SOURCE_KIND_LABELS[sourceKind],
  };
}

// Une fiche visible a toujours un type visible (D13) : la jointure interne ne perd rien.
async function readCard(tx: Tx, cardId: string) {
  const [card] = await tx
    .select({
      id: cards.id,
      title: cards.title,
      typeSlug: cardTypes.slug,
      typeLabel: cardTypes.label,
    })
    .from(cards)
    .innerJoin(cardTypes, eq(cardTypes.id, cards.typeId))
    .where(eq(cards.id, cardId));
  return card ?? null;
}

async function describeSensitiveFact(
  tx: Tx,
  payload: Extract<ReviewPayload, { kind: 'sensitive_fact' }>,
): Promise<Detail | null> {
  const fact = await readFact(tx, payload.factId);
  const card = fact && (await readCard(tx, fact.cardId));
  if (!fact || !card) return null;
  return {
    kind: 'sensitive_fact',
    fact: toBrief(fact),
    cardId: fact.cardId,
    cardTitle: card.title,
    categoryLabel: payload.category && SENSITIVE_CATEGORY_LABELS[payload.category],
  };
}

async function describeConflict(
  tx: Tx,
  catalog: Catalog,
  [firstId, secondId]: [string, string],
): Promise<Detail | null> {
  const first = await readFact(tx, firstId);
  const second = await readFact(tx, secondId);
  const card = first && (await readCard(tx, first.cardId));
  if (!first || !second || !card) return null;
  const predicate = predicatesForType(catalog, card.typeSlug).find(
    (p) => p.slug === first.predicate,
  );
  return {
    kind: 'conflict',
    cardId: card.id,
    cardTitle: card.title,
    predicateLabel: predicate?.label ?? first.predicate,
    facts: [toBrief(first), toBrief(second)],
  };
}

function toBrief({ cardId, predicate, ...brief }: FactRow): FactBrief {
  return brief;
}

// Faits encore en vigueur de la fiche (remplacés exclus), et le plus ancien d'entre eux.
async function readCardBrief(tx: Tx, cardId: string): Promise<CardBrief | null> {
  const card = await readCard(tx, cardId);
  if (!card) return null;
  const current = and(eq(facts.cardId, cardId), ne(facts.status, 'superseded'));
  const [total] = await tx.select({ factCount: count() }).from(facts).where(current);
  const [first] = await tx
    .select({ id: facts.id })
    .from(facts)
    .where(current)
    .orderBy(asc(facts.recordedAt), asc(facts.id))
    .limit(1);
  const firstFact = first ? await readFact(tx, first.id) : null;
  return {
    id: card.id,
    title: card.title,
    typeLabel: card.typeLabel,
    factCount: total?.factCount ?? 0,
    firstFact: firstFact && toBrief(firstFact),
  };
}

async function describeEntityMatch(
  tx: Tx,
  payload: Extract<ReviewPayload, { kind: 'entity_match' }>,
): Promise<Detail | null> {
  const newCard = await readCardBrief(tx, payload.newCardId);
  const candidateCard = await readCardBrief(tx, payload.candidateCardId);
  return newCard && candidateCard ? { kind: 'entity_match', newCard, candidateCard } : null;
}

async function describeProposedType(
  tx: Tx,
  catalog: Catalog,
  typeId: string,
): Promise<Detail | null> {
  const type = catalog.types.find((t) => t.id === typeId);
  // Le type du tenant l'emporte sur celui du socle de même slug.
  const parent = catalog.types
    .filter((t) => t.slug === type?.parentSlug)
    .sort((a, b) => Number(a.isBase) - Number(b.isBase))[0];
  if (!type || !parent) return null;
  const [cardCount] = await tx
    .select({ cards: count() })
    .from(cards)
    .where(eq(cards.typeId, typeId));
  return {
    kind: 'proposed_type',
    type: { id: type.id, slug: type.slug, label: type.label, parentLabel: parent.label },
    cardCount: cardCount?.cards ?? 0,
  };
}
