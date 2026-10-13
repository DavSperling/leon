import { eq } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import {
  cardAliases,
  cardTypes,
  factCandidates,
  facts,
  ingestRuns,
  readLog,
  reviewItems,
} from '@/server/db/schema/memory';
import { adminDb } from './db';
import { createTestTenant, seedCard, seedFact, seedSource } from './fixtures';

// Scénario de droits Paul / Marie / Zoé (plan, C14). Les énoncés servent de jetons de recherche.
export type RightsScenario = {
  tenantId: string;
  paul: TenantContext;
  marie: TenantContext;
  otherTenantId: string;
  zoe: TenantContext;
  ids: {
    paulSource: string;
    paulTurn: string;
    marieSource: string;
    marieTurn: string;
    paulRun: string;
    paulCandidate: string;
    acmeCard: string;
    acmeTeamFact: string;
    acmeConflictFact: string;
    acmePaulFact: string;
    acmeTeamAlias: string;
    orionCard: string;
    orionFact: string;
    orionAlias: string;
    proposedType: string;
    paulReview: string;
    teamReview: string;
    paulReadOrion: string;
    marieReadAcme: string;
    zoeCard: string;
    zoeFact: string;
  };
};

const ZANZIBAR = 'Le contrat ACME contient une clause zanzibar confidentielle.';

async function insertedId(query: Promise<Array<{ id: string }>>): Promise<string> {
  const [row] = await query;
  if (!row) throw new Error('ligne du scénario non créée');
  return row.id;
}

export async function seedRightsScenario(): Promise<RightsScenario> {
  const team = await createTestTenant(['Paul Martin', 'Marie Durand']);
  const other = await createTestTenant(['Zoé Bernard']);
  const [paul, marie] = team.members;
  const [zoe] = other.members;
  if (!paul || !marie || !zoe) throw new Error('membres du scénario non créés');

  const paulSource = await seedSource(paul, { kind: 'claude_code', title: 'Session ACME' });
  const marieSource = await seedSource(marie, { kind: 'chatgpt', title: 'Relance ACME' });
  const pipeline = await seedPaulPipeline(paul, paulSource);
  const acme = await seedAcme(team.tenantId, paul, marie, paulSource, marieSource, pipeline);
  const orion = await seedOrion(paul, paulSource);
  const reviews = await seedReviewsAndReads(team.tenantId, paul, marie, acme, orion.orionCard);
  const zoeIds = await seedZoe(zoe);

  return {
    tenantId: team.tenantId,
    paul,
    marie,
    otherTenantId: other.tenantId,
    zoe,
    ids: {
      paulSource: paulSource.sourceId,
      paulTurn: paulSource.turnId,
      marieSource: marieSource.sourceId,
      marieTurn: marieSource.turnId,
      ...pipeline,
      ...acme,
      ...orion,
      ...reviews,
      ...zoeIds,
    },
  };
}

type SeededSource = { sourceId: string; turnId: string };

async function seedPaulPipeline(paul: TenantContext, source: SeededSource) {
  const acl = [paul.userId];
  const paulRun = await insertedId(
    adminDb
      .insert(ingestRuns)
      .values({ tenantId: paul.tenantId, sourceId: source.sourceId, turnIds: [source.turnId], acl })
      .returning({ id: ingestRuns.id }),
  );
  const paulCandidate = await insertedId(
    adminDb
      .insert(factCandidates)
      .values({
        tenantId: paul.tenantId,
        ingestRunId: paulRun,
        turnId: source.turnId,
        statement: ZANZIBAR,
        predicate: 'note',
        typeHint: 'client',
        mentions: { subject: { name: 'ACME', email: null, domain: null }, others: [] },
        quote: ZANZIBAR,
        confidence: 0.9,
        sensitivity: 'sensitive',
        sensitiveCategory: 'juridique',
        factAcl: acl,
        status: 'placed',
        acl,
      })
      .returning({ id: factCandidates.id }),
  );
  return { paulRun, paulCandidate };
}

async function seedAcme(
  tenantId: string,
  paul: TenantContext,
  marie: TenantContext,
  paulSource: SeededSource,
  marieSource: SeededSource,
  pipeline: { paulCandidate: string },
) {
  const team = [tenantId];
  const acmeCard = await seedCard(tenantId, {
    title: 'ACME',
    typeSlug: 'client',
    acl: [tenantId, paul.userId],
    createdBy: paul.userId,
  });
  const paiement = { cardId: acmeCard, predicate: 'paiement', singleValued: true } as const;
  const acmeTeamFact = await seedFact(tenantId, {
    ...paiement,
    ...marieSource,
    authorId: marie.userId,
    sourceKind: 'chatgpt',
    statement: 'ACME paie ses factures à quarante-cinq jours.',
    status: 'conflict',
    acl: team,
  });
  const acmeConflictFact = await seedFact(tenantId, {
    ...paiement,
    ...paulSource,
    authorId: paul.userId,
    statement: 'ACME paie ses factures à soixante jours.',
    status: 'conflict',
    acl: team,
  });
  const acmePaulFact = await seedFact(tenantId, {
    cardId: acmeCard,
    ...paulSource,
    authorId: paul.userId,
    predicate: 'note',
    statement: ZANZIBAR,
    status: 'pending_review',
    sensitivity: 'sensitive',
    acl: [paul.userId],
  });
  await linkCandidate(acmePaulFact, pipeline.paulCandidate);
  const acmeTeamAlias = await seedAlias(tenantId, acmeCard, 'acme.fr', 'domain', team);
  return { acmeCard, acmeTeamFact, acmeConflictFact, acmePaulFact, acmeTeamAlias };
}

// seedFact (C14) ne prend pas de candidat : le fait sensible de Paul est relié au sien ensuite.
async function linkCandidate(factId: string, candidateId: string): Promise<void> {
  await adminDb.update(facts).set({ candidateId }).where(eq(facts.id, factId));
}

function seedAlias(
  tenantId: string,
  cardId: string,
  alias: string,
  kind: 'name' | 'domain',
  acl: string[],
): Promise<string> {
  return insertedId(
    adminDb
      .insert(cardAliases)
      .values({ tenantId, cardId, alias, kind, acl })
      .returning({ id: cardAliases.id }),
  );
}

async function seedOrion(paul: TenantContext, paulSource: SeededSource) {
  const acl = [paul.userId];
  const orionCard = await seedCard(paul.tenantId, {
    title: 'Orion',
    typeSlug: 'projet',
    acl,
    createdBy: paul.userId,
  });
  const orionFact = await seedFact(paul.tenantId, {
    cardId: orionCard,
    ...paulSource,
    authorId: paul.userId,
    predicate: 'echeance',
    statement: 'Le projet Orion démarre en novembre.',
    singleValued: true,
    acl,
  });
  const orionAlias = await seedAlias(paul.tenantId, orionCard, 'orion', 'name', acl);
  const proposedType = await insertedId(
    adminDb
      .insert(cardTypes)
      .values({
        tenantId: paul.tenantId,
        slug: 'chantier',
        label: 'Chantier',
        parentSlug: 'projet',
        status: 'proposed',
        acl,
      })
      .returning({ id: cardTypes.id }),
  );
  return { orionCard, orionFact, orionAlias, proposedType };
}

async function seedReviewsAndReads(
  tenantId: string,
  paul: TenantContext,
  marie: TenantContext,
  acme: { acmeCard: string; acmeTeamFact: string; acmeConflictFact: string; acmePaulFact: string },
  orionCard: string,
) {
  const review = (
    kind: 'sensitive_fact' | 'conflict',
    payload: Record<string, unknown>,
    acl: string[],
  ) =>
    insertedId(
      adminDb
        .insert(reviewItems)
        .values({ tenantId, kind, payload: { kind, ...payload }, acl })
        .returning({ id: reviewItems.id }),
    );
  const read = (userId: string, client: string, cardId: string, acl: string[]) =>
    insertedId(
      adminDb
        .insert(readLog)
        .values({ tenantId, userId, client, cardId, acl })
        .returning({ id: readLog.id }),
    );
  return {
    paulReview: await review(
      'sensitive_fact',
      { factId: acme.acmePaulFact, category: 'juridique' },
      [paul.userId],
    ),
    teamReview: await review('conflict', { factIds: [acme.acmeTeamFact, acme.acmeConflictFact] }, [
      tenantId,
    ]),
    paulReadOrion: await read(paul.userId, 'claude-code', orionCard, [paul.userId]),
    marieReadAcme: await read(marie.userId, 'interface', acme.acmeCard, [tenantId, paul.userId]),
  };
}

async function seedZoe(zoe: TenantContext) {
  const source = await seedSource(zoe, { kind: 'chatgpt', title: 'Relance ACME' });
  const team = [zoe.tenantId];
  const zoeCard = await seedCard(zoe.tenantId, {
    title: 'ACME',
    typeSlug: 'client',
    acl: team,
    createdBy: zoe.userId,
  });
  const zoeFact = await seedFact(zoe.tenantId, {
    cardId: zoeCard,
    ...source,
    authorId: zoe.userId,
    sourceKind: 'chatgpt',
    predicate: 'paiement',
    statement: 'ACME paie ses factures à quarante-cinq jours.',
    singleValued: true,
    acl: team,
  });
  return { zoeCard, zoeFact };
}
