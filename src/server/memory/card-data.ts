import { and, count, desc, eq, lte, sql } from 'drizzle-orm';
import type { SourceKind } from '@/capture/turn';
import type { CardStatus, FactStatus } from '@/lib/enums';
import type { TenantContext } from '@/server/auth/tenant-context';
import { users } from '@/server/db/schema/auth';
import { cards, cardTypes, facts, readLog, sources, turns } from '@/server/db/schema/memory';
import type { Tx } from '@/server/db/with-tenant';
import { isTeamAcl } from './acl';
import { loadCatalog, predicatesForType } from './catalog';
import { factAuthorName, SOURCE_KIND_LABELS } from './labels';

export type FactView = {
  id: string;
  predicate: string;
  predicateLabel: string;
  statement: string;
  value: string | null;
  quote: string;
  status: FactStatus;
  validFrom: Date;
  validTo: Date | null;
  recordedAt: Date;
  sourceKind: SourceKind;
  sourceKindLabel: string;
  sourceUrl: string | null; // lien vers l'original d'une source d'outil, en https seulement
  authorName: string;
  visibility: 'team' | 'private';
  supersededBy: string | null;
};
export type CardData = {
  id: string;
  title: string;
  typeSlug: string;
  typeLabel: string;
  status: CardStatus;
  factCount: number; // calculés sur ce que voit le lecteur (D8)
  updatedAt: Date;
  readCount: number;
  facts: FactView[]; // non terminés à asOf, faits futurs compris
  history: FactView[]; // remplacés et terminés
};

// Une fiche visible a toujours un type visible (D13) : la jointure interne ne perd rien.
async function readCard(tx: Tx, cardId: string) {
  const [card] = await tx
    .select({
      id: cards.id,
      title: cards.title,
      status: cards.status,
      mergedInto: cards.mergedInto,
      createdAt: cards.createdAt,
      typeSlug: cardTypes.slug,
      typeLabel: cardTypes.label,
    })
    .from(cards)
    .innerJoin(cardTypes, eq(cardTypes.id, cards.typeId))
    .where(eq(cards.id, cardId));
  return card;
}

// Faits visibles de la fiche, enregistrés au plus tard à asOf s'il est donné (sans asOf, aucun
// filtre : l'horloge de Postgres, qui date recorded_at, peut avancer sur celle de l'app).
// Jointures gauches sur la source et le tour cités : sous la RLS, une source ou un tour privés
// restent invisibles, et le fait partagé doit s'afficher quand même.
async function readFacts(tx: Tx, cardId: string, asOf: Date | undefined) {
  return tx
    .select({
      id: facts.id,
      predicate: facts.predicate,
      statement: facts.statement,
      value: facts.value,
      quote: facts.quote,
      status: facts.status,
      validFrom: facts.validFrom,
      validTo: facts.validTo,
      recordedAt: facts.recordedAt,
      sourceKind: facts.sourceKind,
      sourceUrl: sql<string | null>`${sources.metadata}->>'url'`,
      userName: users.name,
      turnAuthorName: turns.authorName,
      acl: facts.acl,
      supersededBy: facts.supersededBy,
    })
    .from(facts)
    .innerJoin(users, eq(users.id, facts.authorId))
    .leftJoin(sources, eq(sources.id, facts.sourceId))
    .leftJoin(turns, eq(turns.id, facts.turnId))
    .where(and(eq(facts.cardId, cardId), asOf && lte(facts.recordedAt, asOf)))
    .orderBy(desc(facts.validFrom), facts.id);
}

async function countReads(tx: Tx, cardId: string): Promise<number> {
  const [row] = await tx.select({ reads: count() }).from(readLog).where(eq(readLog.cardId, cardId));
  return row?.reads ?? 0;
}

// Fiche fusionnée : on lit la fiche survivante (null si elle est invisible).
export async function loadCardData(
  tx: Tx,
  ctx: TenantContext,
  cardId: string,
  options: { asOf?: Date; section?: string },
): Promise<CardData | null> {
  const card = await readCard(tx, cardId);
  if (!card) return null;
  if (card.mergedInto) return loadCardData(tx, ctx, card.mergedInto, options);
  const rows = await readFacts(tx, card.id, options.asOf);
  const labels = new Map(
    predicatesForType(await loadCatalog(tx), card.typeSlug).map((p) => [p.slug, p.label]),
  );
  const views: FactView[] = rows.map(({ acl, userName, turnAuthorName, sourceUrl, ...row }) => ({
    ...row,
    authorName: factAuthorName({ sourceKind: row.sourceKind, userName, turnAuthorName }),
    sourceUrl: sourceUrl?.startsWith('https://') ? sourceUrl : null,
    predicateLabel: labels.get(row.predicate) ?? row.predicate,
    sourceKindLabel: SOURCE_KIND_LABELS[row.sourceKind],
    visibility: isTeamAcl(acl, ctx.tenantId) ? 'team' : 'private',
  }));
  const inSection = views.filter((f) => !options.section || f.predicate === options.section);
  const asOf = options.asOf ?? new Date();
  const current = inSection.filter((f) => f.validTo === null || f.validTo > asOf);
  const updatedAt = rows[0]
    ? new Date(Math.max(...rows.map((row) => row.recordedAt.getTime())))
    : card.createdAt;
  return {
    id: card.id,
    title: card.title,
    typeSlug: card.typeSlug,
    typeLabel: card.typeLabel,
    status: card.status,
    factCount: current.length,
    updatedAt,
    readCount: await countReads(tx, card.id),
    facts: current,
    history: inSection.filter((f) => !current.includes(f)),
  };
}
