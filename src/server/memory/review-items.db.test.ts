import { and, eq, inArray, isNull } from 'drizzle-orm';
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
import { buildBriefing } from './briefing';
import { activateFact } from './facts';
import { fetchCard } from './fetch-card';
import { createReviewItem, type ReviewPayload, ReviewPayloadSchema } from './review-item-write';
import { type ReviewResolution, resolveReviewItem } from './review-items';
import { listCardTree } from './tree';

const OCT_1 = new Date('2026-10-01T09:00:00Z');
const OCT_3 = new Date('2026-10-03T09:00:00Z');
const OCT_10 = new Date('2026-10-10T09:00:00Z');
const YEAR_2030 = new Date('2030-01-01T00:00:00Z');
const OBSOLETE = { kind: 'obsolete' } as const;

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

async function expectResolved(
  itemId: string,
  by: TenantContext,
  resolution: ReviewResolution | typeof OBSOLETE,
) {
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

const openItems = async (tenantId: string) =>
  (
    await adminDb
      .select({ id: reviewItems.id, payload: reviewItems.payload, acl: reviewItems.acl })
      .from(reviewItems)
      .where(and(eq(reviewItems.tenantId, tenantId), eq(reviewItems.status, 'open')))
  ).map((item) => ({ ...item, payload: ReviewPayloadSchema.parse(item.payload) }));

type Validity = { validFrom: Date; validTo: Date | null };
const end = (validTo: Date | null) => validTo?.getTime() ?? Number.POSITIVE_INFINITY;
const overlaps = (x: Validity, y: Validity) =>
  x.validFrom.getTime() < end(y.validTo) && y.validFrom.getTime() < end(x.validTo);

// Après toute résolution : aucun élément ouvert ne cite un fait écarté ; un fait est en contradiction
// si et seulement si un élément ouvert le cite ; jamais deux valeurs actives d'équipe qui se
// chevauchent ; Marie (équipe) voit ces contradictions dans fetchCard et dans le briefing.
async function expectCoherent(tenantId: string, marie: TenantContext, cardId: string) {
  const cardFacts = await adminDb.select().from(facts).where(eq(facts.cardId, cardId));
  const open = await openItems(tenantId);
  const cited = open.flatMap(({ payload }) => (payload.kind === 'conflict' ? payload.factIds : []));
  const idsWith = (status: string) =>
    cardFacts.filter((fact) => fact.status === status).map((fact) => fact.id);
  expect(idsWith('superseded').filter((id) => cited.includes(id))).toEqual([]);
  expect([...new Set(cited)].sort()).toEqual(idsWith('conflict').sort());
  const activeTeam = cardFacts.filter(
    (fact) => fact.status === 'active' && fact.singleValued && fact.acl.includes(tenantId),
  );
  for (const x of activeTeam) {
    for (const y of activeTeam) {
      if (x.id !== y.id && x.predicate === y.predicate) expect(overlaps(x, y)).toBe(false);
    }
  }
  const conflicts = idsWith('conflict').length;
  const fetched = await fetchCard(marie, { id: cardId, client: 'interface' });
  const flagged = fetched?.text.split('\n').filter((line) => line.includes(' (contradiction)'));
  expect(flagged).toHaveLength(conflicts);
  const briefing = await buildBriefing(marie);
  const entry = briefing.entries.find((e) => e.cardId === cardId);
  expect(entry?.hasConflict).toBe(conflicts > 0);
  const seenByMarie = open.filter(
    ({ acl }) => acl.includes(tenantId) || acl.includes(marie.userId),
  );
  expect(briefing.reviewCount).toBe(seenByMarie.length);
}

// A (soixante jours, depuis le 3 octobre) contredit B (quarante-cinq jours, du 1er octobre à 2030)
// et C (trente jours, à partir de 2030) : B et C ne se chevauchent pas, ils étaient actifs ensemble.
// L'activation de A crée les éléments [B,A] et [C,A].
async function threeWayConflict() {
  const scenario = await setup();
  const { tenantId, paul, card, pipelineFact } = scenario;
  const cardId = await card('confirmed', [tenantId]);
  const paiement = {
    predicate: 'paiement',
    singleValued: true,
    acl: [tenantId],
    factAcl: [tenantId],
  };
  const { factId: b } = await pipelineFact(cardId, {
    ...paiement,
    statement: 'ACME paie à quarante-cinq jours.',
    status: 'active',
    validFrom: OCT_1,
  });
  await adminDb.update(facts).set({ validTo: YEAR_2030 }).where(eq(facts.id, b));
  const { factId: c } = await pipelineFact(cardId, {
    ...paiement,
    statement: 'ACME paie à trente jours.',
    status: 'active',
    validFrom: YEAR_2030,
  });
  const { factId: a } = await pipelineFact(cardId, {
    ...paiement,
    statement: 'ACME paie à soixante jours.',
    status: 'pending_review',
    validFrom: OCT_3,
  });
  await withTenant(paul, (tx) => activateFact(tx, paul, a, [tenantId]));
  const items = await openItems(tenantId);
  const itemFor = (first: string) => {
    const found = items.find(
      ({ payload }) => payload.kind === 'conflict' && payload.factIds[0] === first,
    );
    if (!found) throw new Error('élément conflict de test absent');
    return found.id;
  };
  return { ...scenario, cardId, a, b, c, ba: itemFor(b), ca: itemFor(c) };
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

  it('lève sur une résolution mal formée et ne change rien', async () => {
    const { paul, ids } = await seedRightsScenario();
    const invalid = { kind: 'sensitive_fact', decision: 'private' } as unknown as ReviewResolution;

    await expect(resolveReviewItem(paul, ids.paulReview, invalid)).rejects.toThrow();

    expect(await readItem(ids.paulReview)).toMatchObject({ status: 'open', resolution: null });
    expect(await readFact(ids.acmePaulFact)).toMatchObject({
      status: 'pending_review',
      acl: [paul.userId],
    });
  });

  it("n'applique qu'une de deux résolutions simultanées du même élément", async () => {
    const { paul, marie, ids } = await seedRightsScenario();
    const first: ReviewResolution = { kind: 'conflict', decision: 'keep_first' };
    const second: ReviewResolution = { kind: 'conflict', decision: 'keep_second' };

    const results = await Promise.all([
      resolveReviewItem(marie, ids.teamReview, first),
      resolveReviewItem(paul, ids.teamReview, second),
    ]);

    expect(results).toContainEqual({ ok: true });
    expect(results).toContainEqual({ ok: false, reason: 'deja_traite' });
    const applied = results[0]?.ok ? first : second;
    expect((await readItem(ids.teamReview))?.resolution).toEqual(applied);
    const statuses = [
      (await readFact(ids.acmeTeamFact))?.status,
      (await readFact(ids.acmeConflictFact))?.status,
    ].sort();
    expect(statuses).toEqual(['active', 'superseded']);
  });
});

describe('resolveReviewItem : état revérifié avant chaque effet', () => {
  it('clôt sans objet un second sensitive_fact sur un fait déjà tranché', async () => {
    const { paul, marie, ids } = await seedRightsScenario();
    const again = await withTenant(paul, (tx) =>
      createReviewItem(
        tx,
        paul,
        { kind: 'sensitive_fact', factId: ids.acmePaulFact, category: null },
        [paul.userId],
      ),
    );

    await resolveReviewItem(paul, ids.paulReview, {
      kind: 'sensitive_fact',
      decision: 'keep_private',
    });

    await expectResolved(again, paul, OBSOLETE);
    const result = await resolveReviewItem(paul, again, {
      kind: 'sensitive_fact',
      decision: 'share',
    });
    expect(result).toEqual({ ok: false, reason: 'deja_traite' });
    expect(await readFact(ids.acmePaulFact)).toMatchObject({
      status: 'active',
      acl: [paul.userId],
    });
    expect(await seesFact(marie, ids.acmePaulFact)).toBe(false);
  });

  it("la clôture reste sous la RLS : Marie ne clôt pas l'élément de Paul qu'elle ne voit pas", async () => {
    const { paul, marie, ids } = await seedRightsScenario();
    // orionFact est déjà actif : cet élément de Paul est sans objet, mais invisible de Marie.
    const stale = await withTenant(paul, (tx) =>
      createReviewItem(
        tx,
        paul,
        { kind: 'sensitive_fact', factId: ids.orionFact, category: null },
        [paul.userId],
      ),
    );

    await resolveReviewItem(marie, ids.teamReview, { kind: 'conflict', decision: 'keep_first' });

    expect(await readItem(stale)).toMatchObject({ status: 'open', resolution: null });

    await resolveReviewItem(paul, ids.paulReview, {
      kind: 'sensitive_fact',
      decision: 'keep_private',
    });

    await expectResolved(stale, paul, OBSOLETE);
  });

  it("refuse un sensitive_fact dont le fait n'est plus à valider, sans effet", async () => {
    const { paul, ids } = await seedRightsScenario();
    await resolveReviewItem(paul, ids.paulReview, {
      kind: 'sensitive_fact',
      decision: 'keep_private',
    });
    const late = await withTenant(paul, (tx) =>
      createReviewItem(
        tx,
        paul,
        { kind: 'sensitive_fact', factId: ids.acmePaulFact, category: null },
        [paul.userId],
      ),
    );

    const result = await resolveReviewItem(paul, late, {
      kind: 'sensitive_fact',
      decision: 'share',
    });

    expect(result).toEqual({ ok: false, reason: 'incoherent' });
    expect(await readItem(late)).toMatchObject({ status: 'open', resolution: null });
    expect(await readFact(ids.acmePaulFact)).toMatchObject({
      status: 'active',
      acl: [paul.userId],
    });
  });

  it('clôt sans objet un second conflict sur la même paire', async () => {
    const { tenantId, marie, ids } = await seedRightsScenario();
    const twin = await withTenant(marie, (tx) =>
      createReviewItem(
        tx,
        marie,
        { kind: 'conflict', factIds: [ids.acmeTeamFact, ids.acmeConflictFact] },
        [tenantId],
      ),
    );

    await resolveReviewItem(marie, ids.teamReview, { kind: 'conflict', decision: 'keep_first' });

    await expectResolved(twin, marie, OBSOLETE);
    const before = await readFact(ids.acmeConflictFact);
    const result = await resolveReviewItem(marie, twin, {
      kind: 'conflict',
      decision: 'keep_second',
    });
    expect(result).toEqual({ ok: false, reason: 'deja_traite' });
    expect(await readFact(ids.acmeConflictFact)).toEqual(before);
    expect(await readFact(ids.acmeTeamFact)).toMatchObject({
      status: 'active',
      supersededBy: null,
    });
    await expectCoherent(tenantId, marie, ids.acmeCard);
  });

  // A est en contradiction avec B et avec C. Le test tient B verrouillé le temps que Marie (garder B,
  // écarter A) et Paul (garder A, écarter C) soient tous deux lancés : les décisions d'un tenant se
  // prennent l'une après l'autre, celle de Marie rend celle de Paul sans objet, sans interblocage.
  it('de deux conflicts simultanés qui partagent un fait, le second devient sans objet', async () => {
    const { tenantId, paul, marie, ids } = await seedRightsScenario();
    const [b, a] = [ids.acmeTeamFact, ids.acmeConflictFact];
    const c = await seedFact(tenantId, {
      cardId: ids.acmeCard,
      sourceId: ids.paulSource,
      turnId: ids.paulTurn,
      authorId: paul.userId,
      predicate: 'paiement',
      singleValued: true,
      statement: 'ACME paie ses factures à trente jours.',
      status: 'conflict',
      acl: [tenantId],
    });
    const otherItem = await withTenant(paul, (tx) =>
      createReviewItem(tx, paul, { kind: 'conflict', factIds: [c, a] }, [tenantId]),
    );
    const pause = () => new Promise((resolve) => setTimeout(resolve, 300));
    let releaseB = () => {};
    const bReleased = new Promise<void>((resolve) => {
      releaseB = resolve;
    });
    let bLocked = () => {};
    const bIsLocked = new Promise<void>((resolve) => {
      bLocked = resolve;
    });
    const holdB = adminDb.transaction(async (tx) => {
      await tx.select({ id: facts.id }).from(facts).where(eq(facts.id, b)).for('update');
      bLocked();
      await bReleased;
    });
    await bIsLocked;

    const marieResult = resolveReviewItem(marie, ids.teamReview, {
      kind: 'conflict',
      decision: 'keep_first',
    });
    await pause();
    const paulResult = resolveReviewItem(paul, otherItem, {
      kind: 'conflict',
      decision: 'keep_second',
    });
    await pause();
    releaseB();
    await holdB;

    expect(await Promise.all([marieResult, paulResult])).toEqual([
      { ok: true },
      { ok: false, reason: 'deja_traite' },
    ]);
    expect(await readFact(a)).toMatchObject({ status: 'superseded', supersededBy: b });
    await expectResolved(otherItem, marie, OBSOLETE);
    // C, libéré, est revérifié face à B gardé : les deux valeurs se chevauchent, d'où un nouvel élément.
    expect((await readFact(b))?.status).toBe('conflict');
    expect((await readFact(c))?.status).toBe('conflict');
    await expectCoherent(tenantId, marie, ids.acmeCard);
  });

  it('clôt sans objet un second entity_match sur une fiche déjà confirmée', async () => {
    const { tenantId, paul, card, pipelineFact, item } = await setup();
    const newCard = await card('unconfirmed', [paul.userId], 'ACME SA');
    const first = await card('confirmed', [tenantId], 'ACME');
    const other = await card('confirmed', [tenantId], 'ACME Groupe');
    const { factId } = await pipelineFact(newCard, {
      acl: [paul.userId],
      factAcl: [tenantId],
      status: 'active',
    });
    const firstItem = await item(
      { kind: 'entity_match', newCardId: newCard, candidateCardId: first },
      [paul.userId],
    );
    const otherItem = await item(
      { kind: 'entity_match', newCardId: newCard, candidateCardId: other },
      [paul.userId],
    );

    await resolveReviewItem(paul, firstItem, { kind: 'entity_match', decision: 'different' });

    await expectResolved(otherItem, paul, OBSOLETE);
    const result = await resolveReviewItem(paul, otherItem, {
      kind: 'entity_match',
      decision: 'same',
    });
    expect(result).toEqual({ ok: false, reason: 'deja_traite' });
    expect(await readCard(newCard)).toMatchObject({ status: 'confirmed', mergedInto: null });
    expect(await readFact(factId)).toMatchObject({ cardId: newCard, status: 'active' });
  });

  it('clôt sans objet un entity_match qui cite une fiche fusionnée', async () => {
    const { tenantId, paul, card, item } = await setup();
    const newCard = await card('unconfirmed', [paul.userId], 'ACME SA');
    const candidate = await card('confirmed', [tenantId], 'ACME');
    const third = await card('unconfirmed', [paul.userId], 'ACME Sud');
    const mergeItem = await item(
      { kind: 'entity_match', newCardId: newCard, candidateCardId: candidate },
      [paul.userId],
    );
    const citingMerged = await item(
      { kind: 'entity_match', newCardId: third, candidateCardId: newCard },
      [paul.userId],
    );

    await resolveReviewItem(paul, mergeItem, { kind: 'entity_match', decision: 'same' });

    await expectResolved(citingMerged, paul, OBSOLETE);
    expect((await readCard(third))?.status).toBe('unconfirmed');
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

// Type propre au tenant, privé à Paul : son libellé ne doit jamais devenir visible de Marie.
async function privateLitigeType(tenantId: string, paul: TenantContext) {
  const [type] = await adminDb
    .insert(cardTypes)
    .values({
      tenantId,
      slug: 'litige-prudhommes',
      label: 'Litige prud’hommes',
      parentSlug: 'projet',
      status: 'proposed',
      acl: [paul.userId],
    })
    .returning({ id: cardTypes.id });
  const [base] = await adminDb
    .select({ id: cardTypes.id })
    .from(cardTypes)
    .where(and(eq(cardTypes.slug, 'projet'), isNull(cardTypes.tenantId)));
  if (!type || !base) throw new Error('types de test absents');
  return { typeId: type.id, baseId: base.id };
}

async function expectTypeStaysPrivate(
  paul: TenantContext,
  marie: TenantContext,
  cardId: string,
  types: { typeId: string; baseId: string },
) {
  const [type] = await adminDb
    .select({ acl: cardTypes.acl })
    .from(cardTypes)
    .where(eq(cardTypes.id, types.typeId));
  expect(type?.acl).toEqual([paul.userId]);
  expect((await readCard(cardId))?.typeId).toBe(types.baseId);
  expect(JSON.stringify(await listCardTree(marie)).toLowerCase()).not.toContain('litige');
  const fetched = await fetchCard(marie, { id: cardId, client: 'interface' });
  expect(fetched).not.toBeNull();
  expect(JSON.stringify(fetched).toLowerCase()).not.toContain('litige');
}

describe('entity_match : un type privé reste privé', () => {
  it("different : la fiche passe sous le type parent du socle, le type garde l'ACL de Paul", async () => {
    const { tenantId, paul, marie, card, pipelineFact, item } = await setup();
    const types = await privateLitigeType(tenantId, paul);
    const newCard = await card('unconfirmed', [paul.userId], 'ACME SA');
    await adminDb.update(cards).set({ typeId: types.typeId }).where(eq(cards.id, newCard));
    const candidateCard = await card('confirmed', [tenantId], 'ACME');
    await pipelineFact(newCard, { acl: [paul.userId], factAcl: [tenantId], status: 'active' });
    const itemId = await item(
      { kind: 'entity_match', newCardId: newCard, candidateCardId: candidateCard },
      [paul.userId],
    );

    expect(
      await resolveReviewItem(paul, itemId, { kind: 'entity_match', decision: 'different' }),
    ).toEqual({ ok: true });

    await expectTypeStaysPrivate(paul, marie, newCard, types);
  });

  it('same vers une fiche privée de type privé : la fiche cible passe sous le type parent', async () => {
    const { tenantId, paul, marie, card, pipelineFact, item } = await setup();
    const types = await privateLitigeType(tenantId, paul);
    const newCard = await card('unconfirmed', [paul.userId], 'ACME SA');
    const candidateCard = await card('confirmed', [paul.userId], 'ACME');
    await adminDb
      .update(cards)
      .set({ typeId: types.typeId })
      .where(inArray(cards.id, [newCard, candidateCard]));
    await pipelineFact(newCard, { acl: [paul.userId], factAcl: [tenantId], status: 'active' });
    const itemId = await item(
      { kind: 'entity_match', newCardId: newCard, candidateCardId: candidateCard },
      [paul.userId],
    );

    expect(
      await resolveReviewItem(paul, itemId, { kind: 'entity_match', decision: 'same' }),
    ).toEqual({ ok: true });

    await expectTypeStaysPrivate(paul, marie, candidateCard, types);
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

  it('validate : un second élément sur le même type est clos sans objet', async () => {
    const { paul, ids } = await seedRightsScenario();
    const proposeType = () =>
      withTenant(paul, (tx) =>
        createReviewItem(tx, paul, { kind: 'proposed_type', typeId: ids.proposedType }, [
          paul.userId,
        ]),
      );
    const first = await proposeType();
    const second = await proposeType();

    await resolveReviewItem(paul, first, { kind: 'proposed_type', decision: 'validate' });

    await expectResolved(second, paul, OBSOLETE);
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

describe('conflict : un fait contredit par deux autres', () => {
  it('keep_first sur [B,A] : [C,A] devient sans objet et C redevient actif', async () => {
    const { tenantId, marie, cardId, a, b, c, ba, ca } = await threeWayConflict();

    expect(
      await resolveReviewItem(marie, ba, { kind: 'conflict', decision: 'keep_first' }),
    ).toEqual({ ok: true });

    expect(await readFact(a)).toMatchObject({ status: 'superseded', supersededBy: b });
    expect((await readFact(b))?.status).toBe('active');
    expect((await readFact(c))?.status).toBe('active');
    await expectResolved(ca, marie, OBSOLETE);
    await expectCoherent(tenantId, marie, cardId);
  });

  it('keep_second sur [B,A] : A reste en contradiction tant que [C,A] est ouvert', async () => {
    const { tenantId, marie, cardId, a, b, c, ba, ca } = await threeWayConflict();

    await resolveReviewItem(marie, ba, { kind: 'conflict', decision: 'keep_second' });

    expect(await readFact(b)).toMatchObject({ status: 'superseded', supersededBy: a });
    expect((await readFact(a))?.status).toBe('conflict');
    expect((await readFact(c))?.status).toBe('conflict');
    expect((await readItem(ca))?.status).toBe('open');
    await expectCoherent(tenantId, marie, cardId);

    expect(
      await resolveReviewItem(marie, ca, { kind: 'conflict', decision: 'keep_second' }),
    ).toEqual({ ok: true });

    expect(await readFact(c)).toMatchObject({ status: 'superseded', supersededBy: a });
    expect((await readFact(a))?.status).toBe('active');
    await expectCoherent(tenantId, marie, cardId);
  });

  it('both_wrong sur [B,A] : [C,A] devient sans objet et C redevient actif', async () => {
    const { tenantId, marie, cardId, a, b, c, ba, ca } = await threeWayConflict();

    await resolveReviewItem(marie, ba, { kind: 'conflict', decision: 'both_wrong' });

    for (const id of [a, b]) {
      expect(await readFact(id)).toMatchObject({ status: 'superseded', supersededBy: null });
    }
    expect((await readFact(c))?.status).toBe('active');
    await expectResolved(ca, marie, OBSOLETE);
    await expectCoherent(tenantId, marie, cardId);
  });

  it("la résolution d'un élément devenu sans objet n'a aucun effet", async () => {
    const { tenantId, marie, cardId, a, b, c, ba, ca } = await threeWayConflict();
    await resolveReviewItem(marie, ba, { kind: 'conflict', decision: 'keep_first' });
    const before = await Promise.all([a, b, c].map(readFact));

    const result = await resolveReviewItem(marie, ca, {
      kind: 'conflict',
      decision: 'keep_second',
    });

    expect(result).toEqual({ ok: false, reason: 'deja_traite' });
    expect(await Promise.all([a, b, c].map(readFact))).toEqual(before);
    expect((await readItem(ca))?.resolution).toEqual(OBSOLETE);
    await expectCoherent(tenantId, marie, cardId);
  });
});
