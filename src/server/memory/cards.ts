import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { CardStatus } from '@/lib/enums';
import type { TenantContext } from '@/server/auth/tenant-context';
import { cardAliases, cards, cardTypes } from '@/server/db/schema/memory';
import type { Tx } from '@/server/db/with-tenant';

export type CardCandidate = {
  id: string;
  title: string;
  typeSlug: string;
  status: CardStatus;
  aliases: string[];
  similarity: number;
};

const SIMILARITY_THRESHOLD = 0.3;

// Union faite par Postgres dans l'UPDATE : deux élargissements concurrents ne s'écrasent pas.
const widenedAcl = (column: typeof cards.acl | typeof cardTypes.acl, acl: readonly string[]) =>
  sql`array(select distinct unnest(${column} || ${sql.param(acl)}::uuid[]) order by 1)`;

// Fiches visibles (non fusionnées) portant l'un de ces e-mails ou domaines, comparés en minuscules.
export async function findCardsByHardKey(
  tx: Tx,
  keys: { emails: string[]; domains: string[] },
): Promise<string[]> {
  const lowerAlias = sql`lower(${cardAliases.alias})`;
  const byKind = (kind: 'email' | 'domain', values: string[]) =>
    values.length === 0
      ? undefined
      : and(
          eq(cardAliases.kind, kind),
          inArray(
            lowerAlias,
            values.map((value) => value.toLowerCase()),
          ),
        );
  const match = or(byKind('email', keys.emails), byKind('domain', keys.domains));
  if (!match) return [];
  const rows = await tx
    .selectDistinct({ id: cards.id })
    .from(cardAliases)
    .innerJoin(cards, eq(cards.id, cardAliases.cardId))
    .where(and(isNull(cards.mergedInto), match))
    .orderBy(asc(cards.id));
  return rows.map((row) => row.id);
}

// Fiches visibles dont le titre ou un alias ressemble au nom (pg_trgm), les plus proches d'abord.
export async function findCardCandidates(
  tx: Tx,
  name: string,
  limit = 5,
): Promise<CardCandidate[]> {
  const similarity = sql<number>`greatest(similarity(${cards.title}, ${name}),
    coalesce(max(similarity(${cardAliases.alias}, ${name})), 0))`.mapWith(Number);
  return tx
    .select({
      id: cards.id,
      title: cards.title,
      typeSlug: cardTypes.slug,
      status: cards.status,
      aliases: sql<string[]>`coalesce(array_agg(${cardAliases.alias} order by ${cardAliases.alias})
        filter (where ${isNotNull(cardAliases.alias)}), '{}')`,
      similarity,
    })
    .from(cards)
    .innerJoin(cardTypes, eq(cardTypes.id, cards.typeId))
    .leftJoin(cardAliases, eq(cardAliases.cardId, cards.id))
    .where(isNull(cards.mergedInto))
    .groupBy(cards.id, cardTypes.slug)
    .having(sql`${similarity} > ${SIMILARITY_THRESHOLD}`)
    .orderBy(desc(similarity), asc(cards.id))
    .limit(limit);
}

// Une fiche visible a toujours un type visible (D13) : un type propre au tenant suit l'ACL de ses fiches.
async function widenTenantTypeAcl(tx: Tx, typeId: string, acl: readonly string[]): Promise<void> {
  await tx
    .update(cardTypes)
    .set({ acl: widenedAcl(cardTypes.acl, acl) })
    .where(and(eq(cardTypes.id, typeId), isNotNull(cardTypes.tenantId)));
}

export async function createCard(
  tx: Tx,
  ctx: TenantContext,
  input: { typeId: string; title: string; status: CardStatus; acl: string[] },
): Promise<string> {
  const [card] = await tx
    .insert(cards)
    .values({ tenantId: ctx.tenantId, createdBy: ctx.userId, ...input })
    .returning({ id: cards.id });
  if (!card) throw new Error('fiche non créée');
  await widenTenantTypeAcl(tx, input.typeId, input.acl);
  return card.id;
}

export async function addCardAliases(
  tx: Tx,
  ctx: TenantContext,
  cardId: string,
  aliases: Array<{ alias: string; kind: 'name' | 'email' | 'domain' }>,
  acl: string[],
): Promise<void> {
  if (aliases.length === 0) return;
  await tx
    .insert(cardAliases)
    .values(aliases.map((alias) => ({ tenantId: ctx.tenantId, cardId, acl, ...alias })))
    .onConflictDoNothing();
}

// Union de l'ACL de la fiche (et de son type propre au tenant) avec acl ; fiche invisible ou absente → erreur.
export async function widenCardAcl(tx: Tx, cardId: string, acl: readonly string[]): Promise<void> {
  const [card] = await tx
    .update(cards)
    .set({ acl: widenedAcl(cards.acl, acl) })
    .where(eq(cards.id, cardId))
    .returning({ typeId: cards.typeId });
  if (!card) throw new Error('fiche introuvable ou invisible');
  await widenTenantTypeAcl(tx, card.typeId, acl);
}
