import { and, asc, eq, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { SensitiveCategory } from '@/lib/enums';
import type { TenantContext } from '@/server/auth/tenant-context';
import {
  cardAliases,
  cards,
  cardTypes,
  factCandidates,
  facts,
  ingestRuns,
  reviewItems,
  turns,
} from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { buildBriefing } from '@/server/memory/briefing';
import { findCardsByHardKey } from '@/server/memory/cards';
import { loadCatalog } from '@/server/memory/catalog';
import { fetchCard } from '@/server/memory/fetch-card';
import type { ReviewKind } from '@/server/memory/review-item-write';
import { resolveReviewItem } from '@/server/memory/review-items';
import { searchMemory } from '@/server/memory/search';
import { listCardTree } from '@/server/memory/tree';
import { adminDb } from '@/test/db';
import { createTestTenant, seedCard, seedFact, seedSource } from '@/test/fixtures';
import { applyPlacement } from './apply';
import { buildPlacementContext, type FactCandidateRow } from './context';
import type { PlacementAction } from './plan';

type Subject = { name: string; email: string | null; domain: string | null };
type Team = Awaited<ReturnType<typeof setupTeam>>;
type NewTarget = Extract<PlaceAction['target'], { kind: 'new' }>;
type PlaceAction = Extract<PlacementAction, { kind: 'place' }>;

const CANDIDATE_DATE = new Date('2026-10-13T00:00:00.000Z');
const SEPTEMBER = new Date('2026-09-01T00:00:00.000Z');

// Une équipe Paul / Marie, une source de Paul et un run de Paul à l'étape `placement`.
async function setupTeam() {
  const { tenantId, members } = await createTestTenant(['Paul Martin', 'Marie Durand']);
  const [paul, marie] = members as [TenantContext, TenantContext];
  const source = await seedSource(paul, { kind: 'claude_code', title: 'Session de test' });
  const [run] = await adminDb
    .insert(ingestRuns)
    .values({
      tenantId,
      sourceId: source.sourceId,
      turnIds: [source.turnId],
      step: 'placement',
      status: 'running',
      acl: [paul.userId],
    })
    .returning({ id: ingestRuns.id });
  if (!run) throw new Error('run de test non créé');
  return { tenantId, paul, marie, source, runId: run.id };
}

async function seedCandidate(
  t: Team,
  input: {
    statement: string;
    predicate: string;
    subject?: Subject;
    typeHint?: string;
    sensitive?: SensitiveCategory;
    validFrom?: Date | null;
  },
): Promise<FactCandidateRow> {
  const sensitive = input.sensitive !== undefined;
  const [row] = await adminDb
    .insert(factCandidates)
    .values({
      tenantId: t.tenantId,
      ingestRunId: t.runId,
      turnId: t.source.turnId,
      statement: input.statement,
      predicate: input.predicate,
      typeHint: input.typeHint ?? 'client',
      mentions: { subject: input.subject ?? subject('ACME'), others: [] },
      quote: 'Tour de test.',
      quoteStart: 0,
      quoteEnd: 13,
      validFrom: input.validFrom === undefined ? CANDIDATE_DATE : input.validFrom,
      confidence: 0.8,
      sensitivity: sensitive ? 'sensitive' : 'shareable',
      sensitiveCategory: input.sensitive ?? null,
      factAcl: sensitive ? [t.paul.userId] : [t.tenantId],
      acl: [t.paul.userId],
    })
    .returning();
  if (!row) throw new Error('candidat de test non créé');
  return row;
}

const subject = (name: string, email: string | null = null): Subject => ({
  name,
  email,
  domain: null,
});

const newCard = (
  title: string,
  typeSlug = 'client',
  unconfirmedMatchCardId: string | null = null,
): NewTarget => ({
  kind: 'new',
  title,
  type: { kind: 'existing', slug: typeSlug },
  unconfirmedMatchCardId,
});

const existingCard = (cardId: string): PlaceAction['target'] => ({ kind: 'existing', cardId });

const place = (
  row: FactCandidateRow,
  target: PlaceAction['target'],
  override: Partial<PlaceAction> = {},
): PlaceAction => ({
  kind: 'place',
  candidateId: row.id,
  target,
  predicate: row.predicate,
  relation: { kind: 'new' },
  aliases: [],
  ...override,
});

// Contexte et écriture sous Paul, comme le rangement.
function apply(t: Team, rows: FactCandidateRow[], actions: PlacementAction[]): Promise<void> {
  return withTenant(t.paul, async (tx) => {
    const context = await buildPlacementContext(tx, rows);
    await applyPlacement(tx, t.paul, context, rows, actions);
  });
}

const readCandidate = async (id: string) => {
  const [row] = await adminDb.select().from(factCandidates).where(eq(factCandidates.id, id));
  return row;
};

const readFact = async (id: string) => {
  const [row] = await adminDb.select().from(facts).where(eq(facts.id, id));
  return row;
};

const factsOfCandidate = (candidateId: string) =>
  adminDb.select().from(facts).where(eq(facts.candidateId, candidateId));

const cardsOfTenant = (tenantId: string) =>
  adminDb.select().from(cards).where(eq(cards.tenantId, tenantId)).orderBy(asc(cards.createdAt));

const itemsOfTenant = (tenantId: string, kind: ReviewKind) =>
  adminDb
    .select()
    .from(reviewItems)
    .where(and(eq(reviewItems.tenantId, tenantId), eq(reviewItems.kind, kind)));

// Type proposé privé de Paul, au libellé né d'un candidat sensible (T12b).
async function seedPrivateLitigeType(t: Team) {
  const [type] = await adminDb
    .insert(cardTypes)
    .values({
      tenantId: t.tenantId,
      slug: 'litige-prudhommes',
      label: 'Litige prud homal',
      parentSlug: 'projet',
      status: 'proposed',
      acl: [t.paul.userId],
    })
    .returning();
  if (!type) throw new Error('type de test non créé');
  return type;
}

async function socleTypeId(slug: string): Promise<string | undefined> {
  const [type] = await adminDb
    .select({ id: cardTypes.id })
    .from(cardTypes)
    .where(and(eq(cardTypes.slug, slug), isNull(cardTypes.tenantId)));
  return type?.id;
}

async function typeAcl(typeId: string): Promise<string[] | null | undefined> {
  const [type] = await adminDb
    .select({ acl: cardTypes.acl })
    .from(cardTypes)
    .where(eq(cardTypes.id, typeId));
  return type?.acl;
}

const seedTeamCard = (t: Team, title: string) =>
  seedCard(t.tenantId, {
    title,
    typeSlug: 'client',
    acl: [t.tenantId],
    createdBy: t.paul.userId,
  });

// Fait actif mono-valué de la fiche, d'équipe par défaut.
const seedActiveFact = (
  t: Team,
  cardId: string,
  input: { predicate: string; statement: string; acl?: string[] },
) =>
  seedFact(t.tenantId, {
    cardId,
    ...t.source,
    authorId: t.paul.userId,
    predicate: input.predicate,
    statement: input.statement,
    acl: input.acl ?? [t.tenantId],
    singleValued: true,
    validFrom: SEPTEMBER,
  });

describe('applyPlacement', () => {
  it('rejette un candidat avec sa raison', async () => {
    const t = await setupTeam();
    const row = await seedCandidate(t, { statement: 'ACME est sympathique.', predicate: 'note' });

    await apply(t, [row], [{ kind: 'reject', candidateId: row.id, reason: 'fiche inconnue' }]);

    expect(await readCandidate(row.id)).toMatchObject({
      status: 'rejected',
      rejectionReason: 'fiche inconnue',
    });
    expect(await factsOfCandidate(row.id)).toEqual([]);
  });

  it('crée une fiche confirmée à l ACL du fait, avec le fait actif et ses alias', async () => {
    const t = await setupTeam();
    const row = await seedCandidate(t, {
      statement: 'ACME paie ses factures à soixante jours.',
      predicate: 'paiement',
    });
    const aliases = [
      { alias: 'ACME', kind: 'name' as const },
      { alias: 'acme.fr', kind: 'domain' as const },
    ];

    await apply(t, [row], [place(row, newCard('ACME'), { aliases })]);

    const [card, ...others] = await cardsOfTenant(t.tenantId);
    expect(others).toEqual([]);
    expect(card).toMatchObject({
      title: 'ACME',
      status: 'confirmed',
      acl: [t.tenantId],
      createdBy: t.paul.userId,
    });
    const [fact] = await factsOfCandidate(row.id);
    expect(fact).toMatchObject({
      cardId: card?.id,
      status: 'active',
      acl: [t.tenantId],
      predicate: 'paiement',
      singleValued: true,
      sourceId: t.source.sourceId,
      turnId: t.source.turnId,
      sourceKind: 'claude_code',
      authorId: t.paul.userId,
      quoteStart: 0,
      quoteEnd: 13,
    });
    const aliasRows = await adminDb
      .select({ alias: cardAliases.alias, kind: cardAliases.kind, acl: cardAliases.acl })
      .from(cardAliases)
      .where(eq(cardAliases.cardId, card?.id ?? ''))
      .orderBy(asc(cardAliases.alias));
    expect(aliasRows).toEqual([
      { alias: 'ACME', kind: 'name', acl: [t.tenantId] },
      { alias: 'acme.fr', kind: 'domain', acl: [t.tenantId] },
    ]);
    expect((await readCandidate(row.id))?.status).toBe('placed');
  });

  it('range trois candidats qui créent « ACME » sur une seule fiche', async () => {
    const t = await setupTeam();
    const rows = [
      await seedCandidate(t, { statement: 'ACME paie à soixante jours.', predicate: 'paiement' }),
      await seedCandidate(t, { statement: 'ACME veut un devis.', predicate: 'besoin' }),
      await seedCandidate(t, { statement: 'ACME est à Lyon.', predicate: 'note' }),
    ];
    const titles = ['ACME', 'Acme', 'ACMÉ'];

    await apply(
      t,
      rows,
      rows.map((row, n) => place(row, newCard(titles[n] ?? ''))),
    );

    const allCards = await cardsOfTenant(t.tenantId);
    expect(allCards).toHaveLength(1);
    const cardId = allCards[0]?.id;
    for (const row of rows) expect((await factsOfCandidate(row.id))[0]?.cardId).toBe(cardId);
  });

  it('crée un seul type pour deux propositions du même slug', async () => {
    const t = await setupTeam();
    const north = await seedCandidate(t, {
      statement: 'Le chantier Nord démarre.',
      predicate: 'note',
    });
    const south = await seedCandidate(t, {
      statement: 'Le chantier Sud démarre.',
      predicate: 'note',
    });
    const chantier = {
      kind: 'proposed' as const,
      slug: 'chantier',
      label: 'Chantier',
      parentSlug: 'projet',
    };
    const target = (title: string) => ({ ...newCard(title), type: chantier });

    await apply(
      t,
      [north, south],
      [place(north, target('Chantier Nord')), place(south, target('Chantier Sud'))],
    );

    const types = await adminDb
      .select()
      .from(cardTypes)
      .where(and(eq(cardTypes.tenantId, t.tenantId), eq(cardTypes.slug, 'chantier')));
    expect(types).toHaveLength(1);
    const allCards = await cardsOfTenant(t.tenantId);
    expect(allCards.map((card) => card.typeId)).toEqual([types[0]?.id, types[0]?.id]);
    expect(await itemsOfTenant(t.tenantId, 'proposed_type')).toHaveLength(1);
  });

  it('crée deux fiches pour un candidat ambigu et un candidat nouveau au même titre', async () => {
    const t = await setupTeam();
    const lookalike = await seedTeamCard(t, 'ACME Industries');
    const sure = await seedCandidate(t, {
      statement: 'ACME paie à soixante jours.',
      predicate: 'paiement',
    });
    const unsure = await seedCandidate(t, {
      statement: 'ACME veut un devis.',
      predicate: 'besoin',
    });

    await apply(
      t,
      [sure, unsure],
      [place(sure, newCard('ACME')), place(unsure, newCard('ACME', 'client', lookalike))],
    );

    const created = (await cardsOfTenant(t.tenantId)).filter((card) => card.id !== lookalike);
    expect(created).toHaveLength(2);
    const confirmed = created.find((card) => card.status === 'confirmed');
    const unconfirmed = created.find((card) => card.status === 'unconfirmed');
    expect(confirmed?.acl).toEqual([t.tenantId]);
    expect(unconfirmed?.acl).toEqual([t.paul.userId]);
    expect((await factsOfCandidate(sure.id))[0]?.cardId).toBe(confirmed?.id);
    expect((await factsOfCandidate(unsure.id))[0]).toMatchObject({
      cardId: unconfirmed?.id,
      acl: [t.paul.userId],
    });
  });

  it('crée un type proposé à l ACL de l action, visible de Marie, avec son élément', async () => {
    const t = await setupTeam();
    const row = await seedCandidate(t, {
      statement: 'Le chantier Nord démarre.',
      predicate: 'note',
    });
    const chantier = {
      kind: 'proposed' as const,
      slug: 'chantier',
      label: 'Chantier',
      parentSlug: 'projet',
    };

    await apply(t, [row], [place(row, { ...newCard('Chantier Nord'), type: chantier })]);

    const [type] = await adminDb
      .select()
      .from(cardTypes)
      .where(and(eq(cardTypes.tenantId, t.tenantId), eq(cardTypes.slug, 'chantier')));
    expect(type).toMatchObject({ status: 'proposed', acl: [t.tenantId], parentSlug: 'projet' });
    const [item] = await itemsOfTenant(t.tenantId, 'proposed_type');
    expect(item).toMatchObject({
      payload: { kind: 'proposed_type', typeId: type?.id },
      acl: [t.tenantId],
    });
    const marieCatalog = await withTenant(t.marie, loadCatalog);
    expect(marieCatalog.types.map((ty) => ty.slug)).toContain('chantier');
  });

  it('prend le type parent quand le slug proposé est déjà pris par un type invisible', async () => {
    const t = await setupTeam();
    await adminDb.insert(cardTypes).values({
      tenantId: t.tenantId,
      slug: 'chantier',
      label: 'Chantier',
      parentSlug: 'projet',
      status: 'proposed',
      acl: [t.marie.userId],
    });
    const row = await seedCandidate(t, {
      statement: 'Le chantier Nord démarre.',
      predicate: 'note',
    });
    const chantier = {
      kind: 'proposed' as const,
      slug: 'chantier',
      label: 'Chantier',
      parentSlug: 'projet',
    };

    await apply(t, [row], [place(row, { ...newCard('Chantier Nord'), type: chantier })]);

    const [card] = await cardsOfTenant(t.tenantId);
    const [projet] = await adminDb
      .select({ id: cardTypes.id })
      .from(cardTypes)
      .where(and(eq(cardTypes.slug, 'projet'), isNull(cardTypes.tenantId)));
    expect(card?.typeId).toBe(projet?.id);
    expect(await itemsOfTenant(t.tenantId, 'proposed_type')).toEqual([]);
  });

  it('garde une fiche ambiguë non confirmée et privée, avec son élément entity_match', async () => {
    const t = await setupTeam();
    const lookalike = await seedTeamCard(t, 'ACME Industries');
    const row = await seedCandidate(t, { statement: 'ACME veut un devis.', predicate: 'besoin' });

    await apply(
      t,
      [row],
      [
        place(row, newCard('ACME', 'client', lookalike), {
          aliases: [{ alias: 'ACME', kind: 'name' }],
        }),
      ],
    );

    const [card] = (await cardsOfTenant(t.tenantId)).filter((c) => c.id !== lookalike);
    expect(card).toMatchObject({ status: 'unconfirmed', acl: [t.paul.userId] });
    expect((await factsOfCandidate(row.id))[0]).toMatchObject({
      status: 'active',
      acl: [t.paul.userId],
    });
    const [item] = await itemsOfTenant(t.tenantId, 'entity_match');
    expect(item).toMatchObject({
      payload: { kind: 'entity_match', newCardId: card?.id, candidateCardId: lookalike },
      acl: [t.paul.userId],
    });
    const [alias] = await adminDb
      .select({ acl: cardAliases.acl })
      .from(cardAliases)
      .where(eq(cardAliases.cardId, card?.id ?? ''));
    expect(alias?.acl).toEqual([t.paul.userId]);
  });

  it('range un candidat sensible en privé, sans relation, avec des alias privés', async () => {
    const t = await setupTeam();
    const boreal = await seedTeamCard(t, 'Boréal');
    const teamFact = await seedActiveFact(t, boreal, {
      predicate: 'tarif',
      statement: 'Boréal paie le tarif standard.',
    });
    const row = await seedCandidate(t, {
      statement: 'Boréal obtient une remise réservée.',
      predicate: 'tarif',
      subject: subject('Boréal', 'paul.perso@exemple.fr'),
      sensitive: 'remuneration',
    });
    const reviewsBefore = (await buildBriefing(t.marie)).reviewCount;

    await apply(
      t,
      [row],
      [
        place(row, existingCard(boreal), {
          relation: { kind: 'supersedes', factId: teamFact },
          aliases: [{ alias: 'paul.perso@exemple.fr', kind: 'email' }],
        }),
      ],
    );

    const [fact] = await factsOfCandidate(row.id);
    expect(fact).toMatchObject({ status: 'pending_review', acl: [t.paul.userId] });
    expect(await readFact(teamFact)).toMatchObject({ status: 'active', validTo: null });
    const [item] = await itemsOfTenant(t.tenantId, 'sensitive_fact');
    expect(item).toMatchObject({
      payload: { kind: 'sensitive_fact', factId: fact?.id, category: 'remuneration' },
      acl: [t.paul.userId],
    });
    const byEmail = { emails: ['paul.perso@exemple.fr'], domains: [] };
    expect(await withTenant(t.paul, (tx) => findCardsByHardKey(tx, byEmail))).toEqual([boreal]);
    expect(await withTenant(t.marie, (tx) => findCardsByHardKey(tx, byEmail))).toEqual([]);
    expect(await searchMemory(t.marie, { query: 'paul.perso@exemple.fr' })).toEqual([]);
    expect((await buildBriefing(t.marie)).reviewCount).toBe(reviewsBefore);
  });

  it('rejette un doublon sans écrire de fait', async () => {
    const t = await setupTeam();
    const boreal = await seedTeamCard(t, 'Boréal');
    const teamFact = await seedActiveFact(t, boreal, {
      predicate: 'tarif',
      statement: 'Boréal paie le tarif standard.',
    });
    const row = await seedCandidate(t, {
      statement: 'Boréal est au tarif standard.',
      predicate: 'tarif',
      subject: subject('Boréal'),
    });

    await apply(
      t,
      [row],
      [place(row, existingCard(boreal), { relation: { kind: 'duplicate', factId: teamFact } })],
    );

    expect(await readCandidate(row.id)).toMatchObject({
      status: 'rejected',
      rejectionReason: `doublon de ${teamFact}`,
    });
    expect(await factsOfCandidate(row.id)).toEqual([]);
  });

  it('remplace le fait visé par supersedes', async () => {
    const t = await setupTeam();
    const boreal = await seedTeamCard(t, 'Boréal');
    const old = await seedActiveFact(t, boreal, {
      predicate: 'tarif',
      statement: 'Tarif standard.',
    });
    const row = await seedCandidate(t, {
      statement: 'Tarif remisé.',
      predicate: 'tarif',
      subject: subject('Boréal'),
    });

    await apply(
      t,
      [row],
      [place(row, existingCard(boreal), { relation: { kind: 'supersedes', factId: old } })],
    );

    const [fact] = await factsOfCandidate(row.id);
    expect(fact?.status).toBe('active');
    expect(await readFact(old)).toMatchObject({
      status: 'superseded',
      supersededBy: fact?.id,
      validTo: CANDIDATE_DATE,
    });
  });

  it('met en contradiction le fait visé par contradicts', async () => {
    const t = await setupTeam();
    const boreal = await seedTeamCard(t, 'Boréal');
    const old = await seedActiveFact(t, boreal, {
      predicate: 'tarif',
      statement: 'Tarif standard.',
    });
    const row = await seedCandidate(t, {
      statement: 'Tarif premium.',
      predicate: 'tarif',
      subject: subject('Boréal'),
    });

    await apply(
      t,
      [row],
      [place(row, existingCard(boreal), { relation: { kind: 'contradicts', factId: old } })],
    );

    const [fact] = await factsOfCandidate(row.id);
    expect(fact?.status).toBe('conflict');
    expect((await readFact(old))?.status).toBe('conflict');
    const [item] = await itemsOfTenant(t.tenantId, 'conflict');
    expect(item?.payload).toEqual({ kind: 'conflict', factIds: [old, fact?.id] });
  });

  it('passe en contradiction un fait nouveau qui chevauche un fait actif d équipe mono-valué', async () => {
    const t = await setupTeam();
    const boreal = await seedTeamCard(t, 'Boréal');
    const old = await seedActiveFact(t, boreal, {
      predicate: 'tarif',
      statement: 'Tarif standard.',
    });
    const row = await seedCandidate(t, {
      statement: 'Tarif premium.',
      predicate: 'tarif',
      subject: subject('Boréal'),
    });

    await apply(t, [row], [place(row, existingCard(boreal))]);

    const [fact] = await factsOfCandidate(row.id);
    expect(fact?.status).toBe('conflict');
    expect((await readFact(old))?.status).toBe('conflict');
    expect(await itemsOfTenant(t.tenantId, 'conflict')).toHaveLength(1);
  });

  it('laisse intact un fait actif privé de Paul au même prédicat (D14)', async () => {
    const t = await setupTeam();
    const boreal = await seedTeamCard(t, 'Boréal');
    const privateFact = await seedActiveFact(t, boreal, {
      predicate: 'tarif',
      statement: 'Boréal a une remise personnelle.',
      acl: [t.paul.userId],
    });
    const row = await seedCandidate(t, {
      statement: 'Boréal paie le tarif premium.',
      predicate: 'tarif',
      subject: subject('Boréal'),
    });

    await apply(t, [row], [place(row, existingCard(boreal))]);

    expect((await factsOfCandidate(row.id))[0]).toMatchObject({
      status: 'active',
      acl: [t.tenantId],
    });
    expect((await readFact(privateFact))?.status).toBe('active');
    const fetched = await fetchCard(t.marie, { id: boreal, client: 'interface' });
    expect(fetched?.text).toContain('Boréal paie le tarif premium.');
    expect(fetched?.text).not.toContain('(contradiction)');
    const briefing = await buildBriefing(t.marie);
    const line = briefing.markdown.split('\n').find((l) => l.startsWith('- Boréal'));
    expect(line).toBeDefined();
    expect(line).not.toContain('contradiction à vérifier');
  });

  it('date le fait du candidat, sinon du tour', async () => {
    const t = await setupTeam();
    const dated = await seedCandidate(t, { statement: 'ACME est à Lyon.', predicate: 'note' });
    const undated = await seedCandidate(t, {
      statement: 'ACME est à Paris.',
      predicate: 'note',
      validFrom: null,
    });

    await apply(
      t,
      [dated, undated],
      [place(dated, newCard('ACME')), place(undated, newCard('ACME'))],
    );

    const [turn] = await adminDb
      .select({ ts: turns.ts })
      .from(turns)
      .where(eq(turns.id, t.source.turnId));
    expect((await factsOfCandidate(dated.id))[0]?.validFrom).toEqual(CANDIDATE_DATE);
    expect((await factsOfCandidate(undated.id))[0]?.validFrom).toEqual(turn?.ts);
  });

  it('écrit comme nouveau un fait dont la cible a déjà été mise en contradiction', async () => {
    const t = await setupTeam();
    const boreal = await seedTeamCard(t, 'Boréal');
    const old = await seedActiveFact(t, boreal, {
      predicate: 'tarif',
      statement: 'Tarif standard.',
    });
    const premium = await seedCandidate(t, {
      statement: 'Tarif premium.',
      predicate: 'tarif',
      subject: subject('Boréal'),
    });
    const discounted = await seedCandidate(t, {
      statement: 'Tarif remisé.',
      predicate: 'tarif',
      subject: subject('Boréal'),
    });

    await apply(
      t,
      [premium, discounted],
      [
        place(premium, existingCard(boreal), { relation: { kind: 'contradicts', factId: old } }),
        place(discounted, existingCard(boreal), { relation: { kind: 'supersedes', factId: old } }),
      ],
    );

    expect(await readFact(old)).toMatchObject({
      status: 'conflict',
      validTo: null,
      supersededBy: null,
    });
    const [premiumFact] = await factsOfCandidate(premium.id);
    expect(premiumFact?.status).toBe('conflict');
    const items = await itemsOfTenant(t.tenantId, 'conflict');
    expect(items.map((item) => item.payload)).toEqual([
      { kind: 'conflict', factIds: [old, premiumFact?.id] },
    ]);
    for (const item of items) {
      const decision = { kind: 'conflict' as const, decision: 'keep_first' as const };
      expect(await resolveReviewItem(t.paul, item.id, decision)).toEqual({ ok: true });
    }
  });

  it('ne rend pas visible de l équipe un type resté privé de Paul', async () => {
    const t = await setupTeam();
    const litige = {
      kind: 'proposed' as const,
      slug: 'litige-prudhommes',
      label: 'Litige prud homal',
      parentSlug: 'projet',
    };
    const personal = await seedCandidate(t, {
      statement: 'Paul a un litige personnel.',
      predicate: 'note',
      sensitive: 'juridique',
    });
    const sameRun = await seedCandidate(t, { statement: 'Litige Nord ouvert.', predicate: 'note' });
    await apply(
      t,
      [personal, sameRun],
      [
        place(personal, { ...newCard('Litige Paul'), type: litige }),
        place(sameRun, { ...newCard('Litige Nord'), type: litige }),
      ],
    );
    const laterRun = await seedCandidate(t, { statement: 'Litige Sud ouvert.', predicate: 'note' });
    await apply(t, [laterRun], [place(laterRun, newCard('Litige Sud', 'litige-prudhommes'))]);

    const [type] = await adminDb
      .select()
      .from(cardTypes)
      .where(and(eq(cardTypes.tenantId, t.tenantId), eq(cardTypes.slug, litige.slug)));
    expect(type?.acl).toEqual([t.paul.userId]);
    const marieCatalog = await withTenant(t.marie, loadCatalog);
    expect(marieCatalog.types.map((ty) => ty.slug)).not.toContain(litige.slug);
    const [projet] = await adminDb
      .select({ id: cardTypes.id })
      .from(cardTypes)
      .where(and(eq(cardTypes.slug, 'projet'), isNull(cardTypes.tenantId)));
    const teamCards = (await cardsOfTenant(t.tenantId)).filter(
      (card) => card.title !== 'Litige Paul',
    );
    expect(teamCards.map((card) => card.typeId)).toEqual([projet?.id, projet?.id]);
  });

  it('range sous le parent du socle une fiche d équipe qui choisit un type privé (T12b)', async () => {
    const t = await setupTeam();
    const litige = await seedPrivateLitigeType(t);
    const team = await seedCandidate(t, {
      statement: 'Le dossier Sud est ouvert.',
      predicate: 'note',
    });
    const personal = await seedCandidate(t, {
      statement: 'Paul consulte un avocat.',
      predicate: 'note',
      sensitive: 'juridique',
    });

    await apply(
      t,
      [team, personal],
      [
        place(team, newCard('Dossier Sud', 'litige-prudhommes')),
        place(personal, newCard('Avocat de Paul', 'litige-prudhommes')),
      ],
    );

    const allCards = await cardsOfTenant(t.tenantId);
    const teamCard = allCards.find((card) => card.title === 'Dossier Sud');
    const privateCard = allCards.find((card) => card.title === 'Avocat de Paul');
    expect(teamCard).toMatchObject({ typeId: await socleTypeId('projet'), acl: [t.tenantId] });
    expect(privateCard).toMatchObject({ typeId: litige.id, acl: [t.paul.userId] });
    expect(await typeAcl(litige.id)).toEqual([t.paul.userId]);

    const tree = await listCardTree(t.marie);
    expect(JSON.stringify(tree)).not.toMatch(/litige/i);
    const projetNode = tree.find((node) => node.slug === 'projet');
    expect(projetNode?.cards.map((card) => card.title)).toEqual(['Dossier Sud']);
    const fetched = await fetchCard(t.marie, { id: teamCard?.id ?? '', client: 'interface' });
    expect(fetched?.text).toContain('# Dossier Sud (projet)');
    expect(fetched?.text).not.toMatch(/litige/i);
    const results = await searchMemory(t.marie, { query: 'dossier Sud' });
    expect(results.map((r) => [r.id, r.typeSlug, r.typeLabel])).toEqual([
      [teamCard?.id, 'projet', 'Projet'],
    ]);
    const byHiddenType = { query: 'dossier Sud', type: 'litige-prudhommes' };
    expect(await searchMemory(t.marie, byHiddenType)).toEqual([]);
  });

  it('reprend pour une action d équipe la fiche privée de même titre, sous le parent (T12b)', async () => {
    const t = await setupTeam();
    const litige = await seedPrivateLitigeType(t);
    const personal = await seedCandidate(t, {
      statement: 'Paul consulte un avocat pour le dossier Sud.',
      predicate: 'note',
      sensitive: 'juridique',
    });
    const team = await seedCandidate(t, {
      statement: 'Le dossier Sud est ouvert.',
      predicate: 'note',
    });

    await apply(
      t,
      [personal, team],
      [
        place(personal, newCard('Dossier Sud', 'litige-prudhommes')),
        place(team, newCard('Dossier Sud', 'litige-prudhommes')),
      ],
    );

    expect(await typeAcl(litige.id)).toEqual([t.paul.userId]);
    const allCards = await cardsOfTenant(t.tenantId);
    expect(allCards).toHaveLength(1);
    expect(allCards[0]).toMatchObject({
      title: 'Dossier Sud',
      typeId: await socleTypeId('projet'),
    });
    expect(allCards[0]?.acl).toContain(t.tenantId);
    expect(JSON.stringify(await listCardTree(t.marie))).not.toMatch(/litige/i);
  });

  it('range sous le parent une fiche existante au type privé qui reçoit un fait d équipe (T12b)', async () => {
    const t = await setupTeam();
    const litige = await seedPrivateLitigeType(t);
    const lawyer = await seedCard(t.tenantId, {
      title: 'Avocat de Paul',
      typeSlug: 'litige-prudhommes',
      acl: [t.paul.userId],
      createdBy: t.paul.userId,
    });
    const row = await seedCandidate(t, {
      statement: 'L avocat de Paul suit aussi le dossier Sud.',
      predicate: 'note',
      subject: subject('Avocat de Paul'),
    });

    await apply(t, [row], [place(row, existingCard(lawyer))]);

    expect(await typeAcl(litige.id)).toEqual([t.paul.userId]);
    const [card] = await cardsOfTenant(t.tenantId);
    expect(card).toMatchObject({ typeId: await socleTypeId('projet') });
    expect(card?.acl).toContain(t.tenantId);
    const tree = await listCardTree(t.marie);
    expect(JSON.stringify(tree)).not.toMatch(/litige/i);
    const projetNode = tree.find((node) => node.slug === 'projet');
    expect(projetNode?.cards.map((c) => c.title)).toEqual(['Avocat de Paul']);
    const fetched = await fetchCard(t.marie, { id: lawyer, client: 'interface' });
    expect(fetched?.text).toContain('# Avocat de Paul (projet)');
  });

  it('garde un type proposé d équipe choisi par une action d équipe', async () => {
    const t = await setupTeam();
    const [chantier] = await adminDb
      .insert(cardTypes)
      .values({
        tenantId: t.tenantId,
        slug: 'chantier',
        label: 'Chantier',
        parentSlug: 'projet',
        status: 'proposed',
        acl: [t.tenantId],
      })
      .returning();
    const row = await seedCandidate(t, {
      statement: 'Le chantier Nord démarre.',
      predicate: 'note',
    });

    await apply(t, [row], [place(row, newCard('Chantier Nord', 'chantier'))]);

    const [card] = await cardsOfTenant(t.tenantId);
    expect(card).toMatchObject({ typeId: chantier?.id, acl: [t.tenantId] });
    const fetched = await fetchCard(t.marie, { id: card?.id ?? '', client: 'interface' });
    expect(fetched?.text).toContain('# Chantier Nord (chantier)');
  });

  it('voit au moment d écrire un fait concurrent inséré après le contexte (vigilance 4)', async () => {
    const t = await setupTeam();
    const boreal = await seedTeamCard(t, 'Boréal');
    const row = await seedCandidate(t, {
      statement: 'Tarif premium.',
      predicate: 'tarif',
      subject: subject('Boréal'),
    });
    const context = await withTenant(t.paul, (tx) => buildPlacementContext(tx, [row]));
    const concurrent = await seedActiveFact(t, boreal, {
      predicate: 'tarif',
      statement: 'Tarif standard.',
    });

    await withTenant(t.paul, (tx) =>
      applyPlacement(tx, t.paul, context, [row], [place(row, existingCard(boreal))]),
    );

    expect((await factsOfCandidate(row.id))[0]?.status).toBe('conflict');
    expect((await readFact(concurrent))?.status).toBe('conflict');
  });
});
