import { and, eq, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import {
  cardAliases,
  cards,
  cardTypes,
  factCandidates,
  facts,
  ingestRuns,
  reviewItems,
} from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb } from '@/test/db';
import { createTestTenant, seedCard, seedFact, seedSource } from '@/test/fixtures';
import { seedRightsScenario } from '@/test/rights-scenario';
import { unionAcl } from './acl';
import {
  createReviewItem,
  type ReviewPayload,
  type ReviewResolution,
  resolveReviewItem,
} from './review-items';

const OCT_1 = new Date('2026-10-01T09:00:00Z');
const OCT_10 = new Date('2026-10-10T09:00:00Z');

const readFact = async (id: string) =>
  (await adminDb.select().from(facts).where(eq(facts.id, id)))[0];
const readCard = async (id: string) =>
  (await adminDb.select().from(cards).where(eq(cards.id, id)))[0];
const readItem = async (id: string) =>
  (await adminDb.select().from(reviewItems).where(eq(reviewItems.id, id)))[0];
const readCandidate = async (id: string) =>
  (await adminDb.select().from(factCandidates).where(eq(factCandidates.id, id)))[0];
const aliasesOf = (cardId: string) =>
  adminDb
    .select({ alias: cardAliases.alias, kind: cardAliases.kind, acl: cardAliases.acl })
    .from(cardAliases)
    .where(eq(cardAliases.cardId, cardId))
    .orderBy(cardAliases.kind);

// Ce que le lecteur voit sous sa RLS.
const seesFact = async (ctx: TenantContext, id: string) =>
  (await withTenant(ctx, (tx) => tx.select({ id: facts.id }).from(facts).where(eq(facts.id, id))))
    .length === 1;
const seesCard = async (ctx: TenantContext, id: string) =>
  (await withTenant(ctx, (tx) => tx.select({ id: cards.id }).from(cards).where(eq(cards.id, id))))
    .length === 1;

async function expectResolved(itemId: string, by: TenantContext, resolution: ReviewResolution) {
  const item = await readItem(itemId);
  expect(item).toMatchObject({ status: 'resolved', resolution, resolvedBy: by.userId });
  expect(item?.resolvedAt).toBeInstanceOf(Date);
}

// Organisation Paul / Marie ; les faits « du pipeline » ont un candidat qui porte leur ACL voulue.
async function setup() {
  const { tenantId, members } = await createTestTenant(['Paul', 'Marie']);
  const [paul, marie] = members as [TenantContext, TenantContext];
  const source = await seedSource(paul);
  const [run] = await adminDb
    .insert(ingestRuns)
    .values({ tenantId, sourceId: source.sourceId, turnIds: [source.turnId], acl: [paul.userId] })
    .returning({ id: ingestRuns.id });
  if (!run) throw new Error('run de test non créé');

  const card = (status: 'confirmed' | 'unconfirmed', acl: string[], title = 'ACME') =>
    seedCard(tenantId, { title, typeSlug: 'client', acl, status, createdBy: paul.userId });

  const pipelineFact = async (
    cardId: string,
    input: {
      acl: string[];
      factAcl: string[];
      status: 'active' | 'pending_review' | 'conflict';
      predicate?: string;
      statement?: string;
      singleValued?: boolean;
      sensitivity?: 'shareable' | 'sensitive';
      validFrom?: Date;
    },
  ) => {
    const statement = input.statement ?? 'ACME paie à trente jours.';
    const predicate = input.predicate ?? 'note';
    const [candidate] = await adminDb
      .insert(factCandidates)
      .values({
        tenantId,
        ingestRunId: run.id,
        turnId: source.turnId,
        statement,
        predicate,
        typeHint: 'client',
        mentions: { subject: { name: 'ACME', email: null, domain: null }, others: [] },
        quote: statement,
        confidence: 0.9,
        sensitivity: input.sensitivity ?? 'shareable',
        factAcl: input.factAcl,
        status: 'placed',
        acl: [paul.userId],
      })
      .returning({ id: factCandidates.id });
    if (!candidate) throw new Error('candidat de test non créé');
    const factId = await seedFact(tenantId, {
      cardId,
      ...source,
      authorId: paul.userId,
      predicate,
      statement,
      acl: input.acl,
      status: input.status,
      sensitivity: input.sensitivity,
      singleValued: input.singleValued,
      validFrom: input.validFrom,
    });
    await adminDb.update(facts).set({ candidateId: candidate.id }).where(eq(facts.id, factId));
    return { factId, candidateId: candidate.id };
  };

  const alias = async (cardId: string, value: string, kind: 'name' | 'domain', acl: string[]) => {
    await adminDb.insert(cardAliases).values({ tenantId, cardId, alias: value, kind, acl });
  };

  const item = (payload: ReviewPayload, acl: string[]) =>
    withTenant(paul, (tx) => createReviewItem(tx, paul, payload, acl));

  return { tenantId, paul, marie, card, pipelineFact, alias, item };
}

describe('createReviewItem', () => {
  it('crée un élément ouvert avec son payload et son ACL', async () => {
    const { paul, card, pipelineFact, item } = await setup();
    const cardId = await card('confirmed', [paul.userId]);
    const { factId } = await pipelineFact(cardId, {
      acl: [paul.userId],
      factAcl: [paul.userId],
      status: 'pending_review',
    });

    const itemId = await item({ kind: 'sensitive_fact', factId, category: 'rh' }, [paul.userId]);

    expect(await readItem(itemId)).toMatchObject({
      kind: 'sensitive_fact',
      status: 'open',
      payload: { kind: 'sensitive_fact', factId, category: 'rh' },
      acl: [paul.userId],
      resolution: null,
    });
  });

  it('refuse un payload mal formé', async () => {
    const { paul } = await setup();
    const payload = { kind: 'conflict', factIds: ['pas-un-uuid'] } as unknown as ReviewPayload;

    await expect(
      withTenant(paul, (tx) => createReviewItem(tx, paul, payload, [paul.userId])),
    ).rejects.toThrow();
  });
});

describe('resolveReviewItem : garde-fous', () => {
  it("Marie ne trouve pas l'élément privé de Paul et rien ne change", async () => {
    const { paul, marie, ids } = await seedRightsScenario();

    const result = await resolveReviewItem(marie, ids.paulReview, {
      kind: 'sensitive_fact',
      decision: 'share',
    });

    expect(result).toEqual({ ok: false, reason: 'introuvable' });
    expect(await readItem(ids.paulReview)).toMatchObject({ status: 'open', resolution: null });
    expect(await readFact(ids.acmePaulFact)).toMatchObject({
      status: 'pending_review',
      acl: [paul.userId],
    });
    expect(await seesFact(marie, ids.acmePaulFact)).toBe(false);
  });

  it('refuse de traiter deux fois le même élément', async () => {
    const { marie, ids } = await seedRightsScenario();
    const resolution: ReviewResolution = { kind: 'conflict', decision: 'keep_first' };
    await resolveReviewItem(marie, ids.teamReview, resolution);

    const again = await resolveReviewItem(marie, ids.teamReview, {
      kind: 'conflict',
      decision: 'keep_second',
    });

    expect(again).toEqual({ ok: false, reason: 'deja_traite' });
    expect((await readItem(ids.teamReview))?.resolution).toEqual(resolution);
  });

  it("refuse une résolution d'un autre type que l'élément", async () => {
    const { marie, ids } = await seedRightsScenario();

    const result = await resolveReviewItem(marie, ids.teamReview, {
      kind: 'sensitive_fact',
      decision: 'share',
    });

    expect(result).toEqual({ ok: false, reason: 'incoherent' });
    expect((await readItem(ids.teamReview))?.status).toBe('open');
  });
});

describe('sensitive_fact', () => {
  it("share : l'ACL voulue passe à l'équipe, le fait est actif et Marie le lit", async () => {
    const { tenantId, paul, marie, ids } = await seedRightsScenario();
    const resolution: ReviewResolution = { kind: 'sensitive_fact', decision: 'share' };

    expect(await resolveReviewItem(paul, ids.paulReview, resolution)).toEqual({ ok: true });

    expect((await readCandidate(ids.paulCandidate))?.factAcl).toEqual([tenantId]);
    expect(await readFact(ids.acmePaulFact)).toMatchObject({ status: 'active', acl: [tenantId] });
    expect(await seesFact(marie, ids.acmePaulFact)).toBe(true);
    await expectResolved(ids.paulReview, paul, resolution);
  });

  it("share : passe en contradiction face à un fait d'équipe qui chevauche", async () => {
    const { tenantId, paul, card, pipelineFact, item } = await setup();
    const cardId = await card('confirmed', [tenantId, paul.userId]);
    const paiement = { predicate: 'paiement', singleValued: true } as const;
    const team = await pipelineFact(cardId, {
      ...paiement,
      acl: [tenantId],
      factAcl: [tenantId],
      status: 'active',
      validFrom: OCT_1,
    });
    const sensitive = await pipelineFact(cardId, {
      ...paiement,
      statement: 'ACME paie à soixante jours.',
      acl: [paul.userId],
      factAcl: [paul.userId],
      status: 'pending_review',
      sensitivity: 'sensitive',
      validFrom: OCT_10,
    });
    const itemId = await item(
      { kind: 'sensitive_fact', factId: sensitive.factId, category: null },
      [paul.userId],
    );

    await resolveReviewItem(paul, itemId, { kind: 'sensitive_fact', decision: 'share' });

    expect(await readFact(sensitive.factId)).toMatchObject({ status: 'conflict', acl: [tenantId] });
    expect((await readFact(team.factId))?.status).toBe('conflict');
  });

  it('keep_private : le fait est actif et reste privé', async () => {
    const { paul, marie, ids } = await seedRightsScenario();
    const resolution: ReviewResolution = { kind: 'sensitive_fact', decision: 'keep_private' };

    expect(await resolveReviewItem(paul, ids.paulReview, resolution)).toEqual({ ok: true });

    expect(await readFact(ids.acmePaulFact)).toMatchObject({
      status: 'active',
      acl: [paul.userId],
    });
    expect((await readCandidate(ids.paulCandidate))?.factAcl).toEqual([paul.userId]);
    expect(await seesFact(marie, ids.acmePaulFact)).toBe(false);
    await expectResolved(ids.paulReview, paul, resolution);
  });

  it("share sur une fiche non confirmée : rien ne s'ouvre avant la confirmation", async () => {
    const { tenantId, paul, marie, card, pipelineFact, item } = await setup();
    const newCard = await card('unconfirmed', [paul.userId], 'ACME Industries');
    const candidateCard = await card('confirmed', [tenantId], 'ACME');
    const { factId, candidateId } = await pipelineFact(newCard, {
      acl: [paul.userId],
      factAcl: [paul.userId],
      status: 'pending_review',
      sensitivity: 'sensitive',
    });
    const shareItem = await item({ kind: 'sensitive_fact', factId, category: 'juridique' }, [
      paul.userId,
    ]);
    const matchItem = await item(
      { kind: 'entity_match', newCardId: newCard, candidateCardId: candidateCard },
      [paul.userId],
    );

    await resolveReviewItem(paul, shareItem, { kind: 'sensitive_fact', decision: 'share' });

    expect((await readCandidate(candidateId))?.factAcl).toEqual([tenantId]);
    expect(await readFact(factId)).toMatchObject({ status: 'active', acl: [paul.userId] });
    expect((await readCard(newCard))?.acl).toEqual([paul.userId]);
    expect(await seesCard(marie, newCard)).toBe(false);
    expect(await seesFact(marie, factId)).toBe(false);

    await resolveReviewItem(paul, matchItem, { kind: 'entity_match', decision: 'different' });

    expect(await readCard(newCard)).toMatchObject({
      status: 'confirmed',
      acl: unionAcl([paul.userId], [tenantId]),
    });
    expect(await readFact(factId)).toMatchObject({ status: 'active', acl: [tenantId] });
    expect(await seesCard(marie, newCard)).toBe(true);
    expect(await seesFact(marie, factId)).toBe(true);
  });
});

describe('entity_match', () => {
  it('same vers une fiche confirmée : faits déplacés et activés, alias copiés, fiche fusionnée', async () => {
    const { tenantId, paul, marie, card, pipelineFact, alias, item } = await setup();
    const newCard = await card('unconfirmed', [paul.userId], 'ACME SA');
    const candidateCard = await card('confirmed', [tenantId], 'ACME');
    const shared = await pipelineFact(newCard, {
      acl: [paul.userId],
      factAcl: [tenantId],
      status: 'active',
    });
    const pending = await pipelineFact(newCard, {
      statement: 'ACME est en litige.',
      acl: [paul.userId],
      factAcl: [paul.userId],
      status: 'pending_review',
      sensitivity: 'sensitive',
    });
    await alias(newCard, 'acme sa', 'name', [paul.userId]);
    await alias(newCard, 'acme.fr', 'domain', [paul.userId]);
    await alias(candidateCard, 'acme.fr', 'domain', [tenantId]);
    const itemId = await item(
      { kind: 'entity_match', newCardId: newCard, candidateCardId: candidateCard },
      [paul.userId],
    );
    const resolution: ReviewResolution = { kind: 'entity_match', decision: 'same' };

    expect(await resolveReviewItem(paul, itemId, resolution)).toEqual({ ok: true });

    expect(await readFact(shared.factId)).toMatchObject({
      cardId: candidateCard,
      status: 'active',
      acl: [tenantId],
    });
    expect(await readFact(pending.factId)).toMatchObject({
      cardId: candidateCard,
      status: 'pending_review',
      acl: [paul.userId],
    });
    expect(await aliasesOf(candidateCard)).toEqual([
      { alias: 'acme.fr', kind: 'domain', acl: [tenantId] },
      { alias: 'acme sa', kind: 'name', acl: [paul.userId] },
    ]);
    expect((await readCard(newCard))?.mergedInto).toBe(candidateCard);
    expect(await seesFact(marie, shared.factId)).toBe(true);
    expect(await seesFact(marie, pending.factId)).toBe(false);
    await expectResolved(itemId, paul, resolution);
  });

  it('same vers une fiche elle-même non confirmée : tout reste privé à Paul', async () => {
    const { tenantId, paul, marie, card, pipelineFact, item } = await setup();
    const newCard = await card('unconfirmed', [paul.userId], 'ACME SA');
    const candidateCard = await card('unconfirmed', [paul.userId], 'ACME');
    const { factId } = await pipelineFact(newCard, {
      acl: [paul.userId],
      factAcl: [tenantId],
      status: 'active',
    });
    const itemId = await item(
      { kind: 'entity_match', newCardId: newCard, candidateCardId: candidateCard },
      [paul.userId],
    );

    expect(
      await resolveReviewItem(paul, itemId, { kind: 'entity_match', decision: 'same' }),
    ).toEqual({
      ok: true,
    });

    expect(await readFact(factId)).toMatchObject({ cardId: candidateCard, acl: [paul.userId] });
    expect((await readCard(candidateCard))?.acl).toEqual([paul.userId]);
    expect(await seesCard(marie, candidateCard)).toBe(false);
    expect(await seesFact(marie, factId)).toBe(false);
  });

  it('different : la fiche est confirmée, ses faits prennent leur ACL voulue sauf ceux à valider', async () => {
    const { tenantId, paul, marie, card, pipelineFact, item } = await setup();
    const newCard = await card('unconfirmed', [paul.userId], 'ACME SA');
    const candidateCard = await card('confirmed', [tenantId], 'ACME');
    const shared = await pipelineFact(newCard, {
      acl: [paul.userId],
      factAcl: [tenantId],
      status: 'active',
    });
    const pending = await pipelineFact(newCard, {
      statement: 'ACME est en litige.',
      acl: [paul.userId],
      factAcl: [paul.userId],
      status: 'pending_review',
      sensitivity: 'sensitive',
    });
    const itemId = await item(
      { kind: 'entity_match', newCardId: newCard, candidateCardId: candidateCard },
      [paul.userId],
    );
    const resolution: ReviewResolution = { kind: 'entity_match', decision: 'different' };

    expect(await resolveReviewItem(paul, itemId, resolution)).toEqual({ ok: true });

    expect(await readCard(newCard)).toMatchObject({
      status: 'confirmed',
      mergedInto: null,
      acl: unionAcl([paul.userId], [tenantId]),
    });
    expect(await readFact(shared.factId)).toMatchObject({ status: 'active', acl: [tenantId] });
    expect(await readFact(pending.factId)).toMatchObject({
      status: 'pending_review',
      acl: [paul.userId],
    });
    expect(await seesFact(marie, shared.factId)).toBe(true);
    expect(await seesFact(marie, pending.factId)).toBe(false);
    await expectResolved(itemId, paul, resolution);
  });
});

describe('proposed_type', () => {
  it('validate : le type passe validé', async () => {
    const { paul, ids } = await seedRightsScenario();
    const itemId = await withTenant(paul, (tx) =>
      createReviewItem(tx, paul, { kind: 'proposed_type', typeId: ids.proposedType }, [
        paul.userId,
      ]),
    );
    const resolution: ReviewResolution = { kind: 'proposed_type', decision: 'validate' };

    expect(await resolveReviewItem(paul, itemId, resolution)).toEqual({ ok: true });

    const [type] = await adminDb.select().from(cardTypes).where(eq(cardTypes.id, ids.proposedType));
    expect(type?.status).toBe('validated');
    await expectResolved(itemId, paul, resolution);
  });

  it('use_parent : les fiches visibles du type passent au type parent', async () => {
    const { tenantId, paul, marie, ids } = await seedRightsScenario();
    const paulCard = await seedCard(tenantId, {
      title: 'Chantier Lyon',
      typeSlug: 'chantier',
      acl: [paul.userId],
      createdBy: paul.userId,
    });
    const marieCard = await seedCard(tenantId, {
      title: 'Chantier Nantes',
      typeSlug: 'chantier',
      acl: [marie.userId],
      createdBy: marie.userId,
    });
    const itemId = await withTenant(paul, (tx) =>
      createReviewItem(tx, paul, { kind: 'proposed_type', typeId: ids.proposedType }, [
        paul.userId,
      ]),
    );

    expect(
      await resolveReviewItem(paul, itemId, { kind: 'proposed_type', decision: 'use_parent' }),
    ).toEqual({ ok: true });

    const [baseProjet] = await adminDb
      .select({ id: cardTypes.id })
      .from(cardTypes)
      .where(and(eq(cardTypes.slug, 'projet'), isNull(cardTypes.tenantId)));
    expect((await readCard(paulCard))?.typeId).toBe(baseProjet?.id);
    expect((await readCard(marieCard))?.typeId).toBe(ids.proposedType);
  });
});

describe('conflict', () => {
  it('keep_first : le second est remplacé par le premier, à validité vide', async () => {
    const { tenantId, marie, ids } = await seedRightsScenario();
    const resolution: ReviewResolution = { kind: 'conflict', decision: 'keep_first' };

    expect(await resolveReviewItem(marie, ids.teamReview, resolution)).toEqual({ ok: true });

    const second = await readFact(ids.acmeConflictFact);
    expect(second).toMatchObject({ status: 'superseded', supersededBy: ids.acmeTeamFact });
    expect(second?.validTo).toEqual(second?.validFrom);
    expect(await readFact(ids.acmeTeamFact)).toMatchObject({ status: 'active', acl: [tenantId] });
    await expectResolved(ids.teamReview, marie, resolution);
  });

  it('keep_second : le premier est remplacé par le second', async () => {
    const { tenantId, paul, ids } = await seedRightsScenario();

    await resolveReviewItem(paul, ids.teamReview, { kind: 'conflict', decision: 'keep_second' });

    const first = await readFact(ids.acmeTeamFact);
    expect(first).toMatchObject({ status: 'superseded', supersededBy: ids.acmeConflictFact });
    expect(first?.validTo).toEqual(first?.validFrom);
    expect(await readFact(ids.acmeConflictFact)).toMatchObject({
      status: 'active',
      acl: [tenantId],
    });
  });

  it('both_wrong : les deux faits sont remplacés, à validité vide', async () => {
    const { marie, ids } = await seedRightsScenario();

    await resolveReviewItem(marie, ids.teamReview, { kind: 'conflict', decision: 'both_wrong' });

    for (const id of [ids.acmeTeamFact, ids.acmeConflictFact]) {
      const fact = await readFact(id);
      expect(fact).toMatchObject({ status: 'superseded', supersededBy: null });
      expect(fact?.validTo).toEqual(fact?.validFrom);
    }
  });
});
