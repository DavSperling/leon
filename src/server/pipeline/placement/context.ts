import { asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { CardStatus } from '@/lib/enums';
import { cardAliases, cards, cardTypes, type factCandidates } from '@/server/db/schema/memory';
import type { Tx } from '@/server/db/with-tenant';
import { findCardCandidates, findCardsByHardKey } from '@/server/memory/cards';
import { type Catalog, loadCatalog } from '@/server/memory/catalog';
import { findActiveTeamFactsOfCard } from '@/server/memory/facts';

export type FactCandidateRow = typeof factCandidates.$inferSelect;

type Subject = { name: string; email: string | null; domain: string | null };
type CardOption = {
  id: string;
  title: string;
  typeSlug: string;
  status: CardStatus;
  aliases: string[];
  activeFacts: Array<{ id: string; predicate: string; statement: string; validFrom: string }>;
};
export type PlacementCandidate = {
  candidateId: string;
  statement: string;
  predicate: string;
  typeHint: string;
  value: string | null;
  subject: Subject;
  quote: string;
  validFrom: string | null;
  sensitive: boolean;
  fixedCardId: string | null; // clé dure trouvée : fiche imposée
  cardOptions: CardOption[];
};
export type PlacementContext = { catalog: Catalog; candidates: PlacementCandidate[] };

type CardSummary = Omit<CardOption, 'activeFacts'>;

const CARD_OPTIONS_MAX = 5;
const ACTIVE_FACTS_MAX = 30; // par fiche proposée : borne la taille du prompt

async function loadCardSummaries(tx: Tx, ids: string[]): Promise<CardSummary[]> {
  if (ids.length === 0) return [];
  return tx
    .select({
      id: cards.id,
      title: cards.title,
      typeSlug: cardTypes.slug,
      status: cards.status,
      aliases: sql<string[]>`coalesce(array_agg(${cardAliases.alias} order by ${cardAliases.alias})
        filter (where ${isNotNull(cardAliases.alias)}), '{}')`,
    })
    .from(cards)
    .innerJoin(cardTypes, eq(cardTypes.id, cards.typeId))
    .leftJoin(cardAliases, eq(cardAliases.cardId, cards.id))
    .where(inArray(cards.id, ids))
    .groupBy(cards.id, cardTypes.slug)
    .orderBy(asc(cards.id));
}

// Fiches visibles de l'auteur (RLS) : celles d'une clé dure d'abord, puis les plus proches par le nom.
// La fiche n'est imposée que si une seule fiche porte la clé dure : sinon, le modèle choisit.
async function findCardsForSubject(tx: Tx, subject: Subject) {
  const hardKeyIds = await findCardsByHardKey(tx, {
    emails: subject.email ? [subject.email] : [],
    domains: subject.domain ? [subject.domain] : [],
  });
  const byKey = await loadCardSummaries(tx, hardKeyIds);
  const byName = await findCardCandidates(tx, subject.name, CARD_OPTIONS_MAX);
  const others = byName
    .filter((card) => !hardKeyIds.includes(card.id))
    .map(({ similarity: _similarity, ...card }) => card);
  return {
    fixedCardId: hardKeyIds.length === 1 ? (hardKeyIds[0] ?? null) : null,
    summaries: [...byKey, ...others].slice(0, CARD_OPTIONS_MAX),
  };
}

// Faits actifs d'équipe seulement (D14) : un fait privé n'est jamais relié à un fait d'équipe.
// Tous les prédicats de la fiche : une même information rangée sous un autre prédicat reste un doublon.
async function withActiveFacts(tx: Tx, card: CardSummary): Promise<CardOption> {
  const activeFacts = await findActiveTeamFactsOfCard(tx, card.id, ACTIVE_FACTS_MAX);
  return {
    ...card,
    activeFacts: activeFacts.map((fact) => ({
      id: fact.id,
      predicate: fact.predicate,
      statement: fact.statement,
      validFrom: fact.validFrom.toISOString(),
    })),
  };
}

async function placementCandidate(tx: Tx, row: FactCandidateRow): Promise<PlacementCandidate> {
  const { name, email, domain } = row.mentions.subject;
  const { fixedCardId, summaries } = await findCardsForSubject(tx, { name, email, domain });
  const cardOptions: CardOption[] = [];
  for (const card of summaries) cardOptions.push(await withActiveFacts(tx, card));
  return {
    candidateId: row.id,
    statement: row.statement,
    predicate: row.predicate,
    typeHint: row.typeHint,
    value: row.value,
    subject: { name, email, domain },
    quote: row.quote,
    validFrom: row.validFrom?.toISOString() ?? null,
    sensitive: row.sensitivity === 'sensitive',
    fixedCardId,
    cardOptions,
  };
}

export async function buildPlacementContext(
  tx: Tx,
  candidates: FactCandidateRow[],
): Promise<PlacementContext> {
  const catalog = await loadCatalog(tx);
  const placementCandidates: PlacementCandidate[] = [];
  for (const row of candidates) placementCandidates.push(await placementCandidate(tx, row));
  return { catalog, candidates: placementCandidates };
}
