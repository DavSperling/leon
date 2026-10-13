import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { cards, facts, readLog } from '@/server/db/schema/memory';
import { adminDb } from '@/test/db';
import { seedCard, seedFact } from '@/test/fixtures';
import { seedRightsScenario } from '@/test/rights-scenario';
import { cardUrl } from './card-url';
import { fetchCard } from './fetch-card';
import { isoDate } from './labels';

const readsOf = (cardId: string, userId: string) =>
  adminDb
    .select()
    .from(readLog)
    .where(and(eq(readLog.cardId, cardId), eq(readLog.userId, userId)));

describe('fetchCard', () => {
  it("ne rend pas une fiche privée de Paul à Marie et n'écrit aucune lecture", async () => {
    const { marie, ids } = await seedRightsScenario();
    expect(await fetchCard(marie, { id: ids.orionCard, client: 'interface' })).toBeNull();
    expect(await readsOf(ids.orionCard, marie.userId)).toHaveLength(0);
  });

  it("montre à Marie les faits d'équipe d'ACME, jamais le fait privé de Paul", async () => {
    const { marie, ids } = await seedRightsScenario();
    const result = await fetchCard(marie, { id: ids.acmeCard, client: 'interface' });
    expect(result?.text).toContain('quarante-cinq');
    expect(result?.text).toContain('soixante');
    expect(result?.text).not.toContain('zanzibar');
    expect(JSON.stringify(result?.card)).not.toContain('zanzibar');
  });

  it('montre à Paul son fait sensible, à valider', async () => {
    const { paul, ids } = await seedRightsScenario();
    const result = await fetchCard(paul, { id: ids.acmeCard, client: 'claude-code' });
    expect(result?.text).toContain('clause zanzibar confidentielle. (à valider)');
  });

  it("ne rend rien hors de l'organisation, ni pour un id inexistant", async () => {
    const { zoe, paul, ids } = await seedRightsScenario();
    expect(await fetchCard(zoe, { id: ids.acmeCard, client: 'interface' })).toBeNull();
    expect(await fetchCard(paul, { id: randomUUID(), client: 'interface' })).toBeNull();
  });

  it("écrit une lecture par fetch, avec le client et l'ACL de la fiche", async () => {
    const { marie, ids } = await seedRightsScenario();
    await fetchCard(marie, { id: ids.acmeCard, client: 'claude-code' });
    const [card] = await adminDb
      .select({ acl: cards.acl })
      .from(cards)
      .where(eq(cards.id, ids.acmeCard));
    const reads = (await readsOf(ids.acmeCard, marie.userId)).filter(
      (r) => r.id !== ids.marieReadAcme,
    );
    expect(reads).toHaveLength(1);
    expect(reads[0]?.client).toBe('claude-code');
    expect(reads[0]?.acl).toEqual(card?.acl);
  });

  it('filtre les faits par section', async () => {
    const { paul, ids } = await seedRightsScenario();
    const result = await fetchCard(paul, {
      id: ids.acmeCard,
      section: 'paiement',
      client: 'interface',
    });
    expect(result?.card.facts.map((f) => f.id).sort()).toEqual(
      [ids.acmeTeamFact, ids.acmeConflictFact].sort(),
    );
    expect(result?.text).not.toContain('zanzibar');
  });

  it('ne montre aucun fait à une date antérieure à leur enregistrement', async () => {
    const { paul, ids } = await seedRightsScenario();
    const asOf = new Date('2020-01-01T00:00:00Z');
    const result = await fetchCard(paul, { id: ids.acmeCard, asOf, client: 'interface' });
    expect(result?.card.facts).toEqual([]);
    expect(result?.text).toContain('· état au 2020-01-01');
  });

  it("montre un fait d'équipe daté dans le futur", async () => {
    const { tenantId, paul, marie, ids } = await seedRightsScenario();
    const validFrom = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const futureFact = await seedFact(tenantId, {
      cardId: ids.acmeCard,
      sourceId: ids.paulSource,
      turnId: ids.paulTurn,
      authorId: paul.userId,
      predicate: 'tarif',
      statement: 'Le tarif convenu passe à 12 000 € HT.',
      singleValued: true,
      validFrom,
      acl: [tenantId],
    });
    const result = await fetchCard(marie, { id: ids.acmeCard, client: 'interface' });
    expect(result?.card.facts.map((f) => f.id)).toContain(futureFact);
    expect(result?.text).toContain(`12 000 € HT. (à partir du ${isoDate(validFrom)})`);
  });

  it('calcule les champs dérivés sur ce que voit le lecteur', async () => {
    const { tenantId, paul, marie, ids } = await seedRightsScenario();
    const privateOld = await seedFact(tenantId, {
      cardId: ids.acmeCard,
      sourceId: ids.paulSource,
      turnId: ids.paulTurn,
      authorId: paul.userId,
      predicate: 'note',
      statement: 'Ancienne note privée de Paul.',
      status: 'superseded',
      validFrom: new Date('2026-01-01T00:00:00Z'),
      acl: [paul.userId],
    });
    const privateRecordedAt = new Date(Date.now() + 3600 * 1000);
    await adminDb
      .update(facts)
      .set({ validTo: new Date('2026-02-01T00:00:00Z'), recordedAt: privateRecordedAt })
      .where(eq(facts.id, privateOld));
    await adminDb.insert(readLog).values({
      tenantId,
      userId: paul.userId,
      client: 'claude-code',
      cardId: ids.acmeCard,
      acl: [paul.userId],
    });

    const forMarie = await fetchCard(marie, { id: ids.acmeCard, client: 'interface' });
    expect(forMarie?.card.factCount).toBe(2);
    expect(forMarie?.card.history).toEqual([]);
    expect(forMarie?.card.readCount).toBe(1);
    expect(forMarie?.card.updatedAt.getTime()).toBeLessThan(privateRecordedAt.getTime());
    expect(forMarie?.card.facts.every((f) => f.visibility === 'team')).toBe(true);

    const forPaul = await fetchCard(paul, { id: ids.acmeCard, client: 'interface' });
    expect(forPaul?.card.factCount).toBe(3);
    expect(forPaul?.card.history.map((f) => f.id)).toEqual([privateOld]);
    expect(forPaul?.card.readCount).toBe(3);
    expect(forPaul?.card.updatedAt).toEqual(privateRecordedAt);
  });

  it('suit une fiche fusionnée vers la fiche survivante', async () => {
    const { tenantId, paul, ids } = await seedRightsScenario();
    const merged = await seedCard(tenantId, {
      title: 'ACME SAS',
      typeSlug: 'client',
      acl: [tenantId],
    });
    await adminDb.update(cards).set({ mergedInto: ids.acmeCard }).where(eq(cards.id, merged));
    const result = await fetchCard(paul, { id: merged, client: 'interface' });
    expect(result?.card.id).toBe(ids.acmeCard);
    expect(await readsOf(ids.acmeCard, paul.userId)).toHaveLength(1);
  });

  it('ne rend rien quand la fiche survivante est invisible', async () => {
    const { tenantId, marie, ids } = await seedRightsScenario();
    const merged = await seedCard(tenantId, {
      title: 'Orion bis',
      typeSlug: 'projet',
      acl: [tenantId],
    });
    await adminDb.update(cards).set({ mergedInto: ids.orionCard }).where(eq(cards.id, merged));
    expect(await fetchCard(marie, { id: merged, client: 'interface' })).toBeNull();
  });
});

describe('cardUrl', () => {
  it("construit l'URL publique de la fiche", () => {
    const id = randomUUID();
    expect(cardUrl(id)).toBe(`http://localhost:3000/fiches/${id}`);
  });
});
