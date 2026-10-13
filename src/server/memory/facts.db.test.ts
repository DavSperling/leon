import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { cards, factCandidates, facts, reviewItems } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb } from '@/test/db';
import { createTestTenant, seedCard, seedFact, seedSource } from '@/test/fixtures';
import { seedRightsScenario } from '@/test/rights-scenario';
import { unionAcl } from './acl';
import {
  activateFact,
  findActiveTeamFacts,
  insertConflictingFact,
  insertFact,
  type NewFact,
  supersedeFact,
  wantedAcl,
} from './facts';

const OCT_1 = new Date('2026-10-01T09:00:00Z');
const OCT_10 = new Date('2026-10-10T09:00:00Z');

async function setup(cardStatus: 'confirmed' | 'unconfirmed' = 'confirmed') {
  const { tenantId, members } = await createTestTenant(['Paul', 'Marie']);
  const [paul, marie] = members as [TenantContext, TenantContext];
  const source = await seedSource(paul);
  const cardId = await seedCard(tenantId, {
    title: 'ACME',
    typeSlug: 'client',
    acl: [paul.userId],
    status: cardStatus,
    createdBy: paul.userId,
  });
  const newFact = (override: Partial<NewFact> = {}): NewFact => ({
    cardId,
    predicate: 'paiement',
    statement: 'ACME paie à trente jours.',
    value: '30',
    quote: 'ACME paie à trente jours',
    quoteStart: 0,
    quoteEnd: 24,
    ...source,
    sourceKind: 'claude_code',
    authorId: paul.userId,
    validFrom: OCT_10,
    validTo: null,
    status: 'active',
    sensitivity: 'shareable',
    singleValued: true,
    confidence: 0.8,
    acl: [tenantId],
    candidateId: null,
    ...override,
  });
  const seedExisting = (acl: string[], status: 'active' | 'pending_review' = 'active') =>
    seedFact(tenantId, {
      cardId,
      ...source,
      authorId: paul.userId,
      predicate: 'paiement',
      statement: 'ACME paie à soixante jours.',
      singleValued: true,
      validFrom: OCT_1,
      status,
      acl,
    });
  return { tenantId, paul, marie, cardId, newFact, seedExisting };
}

const readFact = async (id: string) =>
  (await adminDb.select().from(facts).where(eq(facts.id, id)))[0];
const readCardAcl = async (id: string) =>
  (await adminDb.select({ acl: cards.acl }).from(cards).where(eq(cards.id, id)))[0]?.acl;
const reviewsOf = (tenantId: string) =>
  adminDb.select().from(reviewItems).where(eq(reviewItems.tenantId, tenantId));

describe('insertFact', () => {
  it("élargit l'ACL d'une fiche confirmée à celle du fait", async () => {
    const { tenantId, paul, cardId, newFact } = await setup();

    const factId = await withTenant(paul, (tx) => insertFact(tx, paul, newFact()));

    expect(await readFact(factId)).toMatchObject({ status: 'active', acl: [tenantId] });
    expect(await readCardAcl(cardId)).toEqual(unionAcl([paul.userId], [tenantId]));
  });

  it("écrit le fait d'une fiche non confirmée à l'ACL de son créateur, sans élargir la fiche", async () => {
    const { paul, cardId, newFact } = await setup('unconfirmed');

    const factId = await withTenant(paul, (tx) => insertFact(tx, paul, newFact()));

    expect(await readFact(factId)).toMatchObject({ status: 'active', acl: [paul.userId] });
    expect(await readCardAcl(cardId)).toEqual([paul.userId]);
  });

  it('garde un fait à valider tel quel, sans activation', async () => {
    const { tenantId, paul, newFact, seedExisting } = await setup();
    const existing = await seedExisting([tenantId]);

    const factId = await withTenant(paul, (tx) =>
      insertFact(tx, paul, newFact({ status: 'pending_review', acl: [paul.userId] })),
    );

    expect(await readFact(factId)).toMatchObject({
      status: 'pending_review',
      acl: [paul.userId],
    });
    expect((await readFact(existing))?.status).toBe('active');
  });

  it("lève sur une fiche invisible pour l'acteur et n'écrit rien", async () => {
    const { tenantId, marie, ids } = await seedRightsScenario();
    const fact: NewFact = {
      cardId: ids.orionCard,
      predicate: 'note',
      statement: 'Orion recrute.',
      value: null,
      quote: 'Orion recrute',
      quoteStart: 0,
      quoteEnd: 13,
      sourceId: ids.marieSource,
      turnId: ids.marieTurn,
      sourceKind: 'chatgpt',
      authorId: marie.userId,
      validFrom: OCT_10,
      validTo: null,
      status: 'active',
      sensitivity: 'shareable',
      singleValued: false,
      confidence: 0.8,
      acl: [tenantId],
      candidateId: null,
    };

    await expect(withTenant(marie, (tx) => insertFact(tx, marie, fact))).rejects.toThrow();
    const orionFacts = await adminDb
      .select({ id: facts.id })
      .from(facts)
      .where(eq(facts.cardId, ids.orionCard));
    expect(orionFacts.map((f) => f.id)).toEqual([ids.orionFact]);
  });

  it("passe en contradiction face à un fait actif d'équipe qui chevauche", async () => {
    const { tenantId, paul, newFact, seedExisting } = await setup();
    const existing = await seedExisting([tenantId]);

    const factId = await withTenant(paul, (tx) => insertFact(tx, paul, newFact()));

    expect((await readFact(existing))?.status).toBe('conflict');
    expect(await readFact(factId)).toMatchObject({ status: 'conflict', acl: [tenantId] });
    const reviews = await reviewsOf(tenantId);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      kind: 'conflict',
      status: 'open',
      payload: { kind: 'conflict', factIds: [existing, factId] },
      acl: [tenantId],
    });
  });
});

describe('supersedeFact', () => {
  it("ferme l'ancien fait et active le nouveau", async () => {
    const { tenantId, paul, newFact, seedExisting } = await setup();
    const oldId = await seedExisting([tenantId]);

    const newId = await withTenant(paul, (tx) => supersedeFact(tx, paul, oldId, newFact()));

    expect(await readFact(oldId)).toMatchObject({
      status: 'superseded',
      supersededBy: newId,
      validTo: OCT_10,
    });
    expect(await readFact(newId)).toMatchObject({ status: 'active', acl: [tenantId] });
    expect(await reviewsOf(tenantId)).toEqual([]);
  });

  it("ne fait jamais finir l'ancien fait avant son début", async () => {
    const { tenantId, paul, newFact, seedExisting } = await setup();
    const oldId = await seedExisting([tenantId]);
    const earlier = new Date('2026-09-01T09:00:00Z');

    await withTenant(paul, (tx) => supersedeFact(tx, paul, oldId, newFact({ validFrom: earlier })));

    expect((await readFact(oldId))?.validTo).toEqual(OCT_1);
  });
});

describe('insertConflictingFact', () => {
  it('met les deux faits en contradiction avec un élément au plus restrictif', async () => {
    const { tenantId, paul, newFact, seedExisting } = await setup();
    const existing = await seedExisting([tenantId]);

    const result = await withTenant(paul, (tx) =>
      insertConflictingFact(tx, paul, existing, newFact({ acl: [paul.userId] })),
    );

    expect((await readFact(existing))?.status).toBe('conflict');
    expect(await readFact(result.factId)).toMatchObject({
      status: 'conflict',
      acl: [paul.userId],
    });
    const [review] = await adminDb
      .select()
      .from(reviewItems)
      .where(eq(reviewItems.id, result.reviewItemId));
    expect(review).toMatchObject({
      kind: 'conflict',
      payload: { kind: 'conflict', factIds: [existing, result.factId] },
      acl: [paul.userId],
    });
  });
});

describe('garde-fou D14 : jamais face à un fait privé', () => {
  it('supersedeFact et insertConflictingFact lèvent et ne changent rien', async () => {
    const { tenantId, paul, cardId, newFact, seedExisting } = await setup();
    const privateFact = await seedExisting([paul.userId]);

    await expect(
      withTenant(paul, (tx) => supersedeFact(tx, paul, privateFact, newFact())),
    ).rejects.toThrow();
    await expect(
      withTenant(paul, (tx) => insertConflictingFact(tx, paul, privateFact, newFact())),
    ).rejects.toThrow();

    expect(await readFact(privateFact)).toMatchObject({ status: 'active', validTo: null });
    const cardFacts = await adminDb.select().from(facts).where(eq(facts.cardId, cardId));
    expect(cardFacts).toHaveLength(1);
    expect(await reviewsOf(tenantId)).toEqual([]);
  });
});

describe('activateFact', () => {
  it('active un fait sans chevauchement et élargit la fiche', async () => {
    const { tenantId, paul, cardId, seedExisting } = await setup();
    const factId = await seedExisting([paul.userId], 'pending_review');

    const status = await withTenant(paul, (tx) => activateFact(tx, paul, factId, [tenantId]));

    expect(status).toBe('active');
    expect(await readFact(factId)).toMatchObject({ status: 'active', acl: [tenantId] });
    expect(await readCardAcl(cardId)).toEqual(unionAcl([paul.userId], [tenantId]));
  });

  it("passe en contradiction face à un fait actif d'équipe mono-valué qui chevauche", async () => {
    const { tenantId, paul, newFact, seedExisting } = await setup();
    const pending = await withTenant(paul, (tx) =>
      insertFact(tx, paul, newFact({ status: 'pending_review', acl: [paul.userId] })),
    );
    const existing = await seedExisting([tenantId]);

    const status = await withTenant(paul, (tx) => activateFact(tx, paul, pending, [tenantId]));

    expect(status).toBe('conflict');
    expect((await readFact(existing))?.status).toBe('conflict');
    expect(await readFact(pending)).toMatchObject({ status: 'conflict', acl: [tenantId] });
    const reviews = await reviewsOf(tenantId);
    expect(reviews.map((r) => r.payload)).toEqual([
      { kind: 'conflict', factIds: [existing, pending] },
    ]);
  });

  it("sur une fiche non confirmée, active à l'ACL du créateur sans élargir la fiche", async () => {
    const { tenantId, paul, cardId, seedExisting } = await setup('unconfirmed');
    const factId = await seedExisting([paul.userId], 'pending_review');

    const status = await withTenant(paul, (tx) => activateFact(tx, paul, factId, [tenantId]));

    expect(status).toBe('active');
    expect(await readFact(factId)).toMatchObject({ status: 'active', acl: [paul.userId] });
    expect(await readCardAcl(cardId)).toEqual([paul.userId]);
  });
});

describe('findActiveTeamFacts', () => {
  it("ne renvoie que les faits actifs d'équipe", async () => {
    const { tenantId, paul, cardId, seedExisting } = await setup();
    const team = await seedExisting([tenantId]);
    await seedExisting([paul.userId]);
    await seedExisting([tenantId], 'pending_review');

    const found = await withTenant(paul, (tx) => findActiveTeamFacts(tx, cardId, 'paiement'));

    expect(found).toEqual([
      {
        id: team,
        statement: 'ACME paie à soixante jours.',
        validFrom: OCT_1,
        validTo: null,
        acl: [tenantId],
        singleValued: true,
      },
    ]);
  });

  it('ne renvoie rien de ce que le lecteur ne voit pas', async () => {
    const { marie, ids } = await seedRightsScenario();

    expect(
      await withTenant(marie, (tx) => findActiveTeamFacts(tx, ids.orionCard, 'echeance')),
    ).toEqual([]);
  });
});

describe('wantedAcl', () => {
  it("renvoie l'ACL voulue du candidat, sinon l'ACL du fait", async () => {
    const { tenantId, paul, ids } = await seedRightsScenario();
    await adminDb
      .update(factCandidates)
      .set({ factAcl: [tenantId] })
      .where(eq(factCandidates.id, ids.paulCandidate));

    expect(await withTenant(paul, (tx) => wantedAcl(tx, ids.acmePaulFact))).toEqual([tenantId]);
    expect(await withTenant(paul, (tx) => wantedAcl(tx, ids.orionFact))).toEqual([paul.userId]);
  });
});
