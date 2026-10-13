import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { facts } from '@/server/db/schema/memory';
import { adminDb } from '@/test/db';
import { seedCard, seedFact, seedSource } from '@/test/fixtures';
import { seedRightsScenario } from '@/test/rights-scenario';
import { buildBriefing } from './briefing';

const DAY = 24 * 3600 * 1000;

const titlesOf = (briefing: { entries: Array<{ title: string }> }) =>
  briefing.entries.map((entry) => entry.title).sort();

describe('buildBriefing', () => {
  it('donne à Paul ACME et Orion, avec la contradiction d’ACME signalée', async () => {
    const { paul } = await seedRightsScenario();
    const briefing = await buildBriefing(paul);
    expect(titlesOf(briefing)).toEqual(['ACME', 'Orion']);
    expect(briefing.entries.find((e) => e.title === 'ACME')).toMatchObject({
      typeLabel: 'Client',
      hasConflict: true,
    });
    expect(briefing.entries.find((e) => e.title === 'Orion')).toMatchObject({
      typeLabel: 'Projet',
      latestStatement: 'Le projet Orion démarre en novembre.',
      hasConflict: false,
    });
    expect(briefing.markdown).toContain('Orion (Projet)');
    expect(briefing.markdown).toContain('contradiction à vérifier');
  });

  it("ne montre à Marie ni Orion ni le fait privé d'ACME", async () => {
    const { marie, ids } = await seedRightsScenario();
    const briefing = await buildBriefing(marie);
    expect(titlesOf(briefing)).toEqual(['ACME']);
    expect(briefing.entries[0]?.cardId).toBe(ids.acmeCard);
    expect(briefing.markdown).not.toContain('Orion');
    expect(briefing.markdown).not.toContain('zanzibar');
    expect(JSON.stringify(briefing)).not.toContain('zanzibar');
  });

  it("ne donne à Zoé que sa fiche, jamais celle de l'autre organisation", async () => {
    const { zoe, ids } = await seedRightsScenario();
    const briefing = await buildBriefing(zoe);
    expect(briefing.entries.map((e) => e.cardId)).toEqual([ids.zoeCard]);
    expect(briefing.reviewCount).toBe(0);
  });

  it('compte les éléments ouverts visibles : 2 pour Paul, 1 pour Marie', async () => {
    const { paul, marie } = await seedRightsScenario();
    expect((await buildBriefing(paul)).reviewCount).toBe(2);
    expect((await buildBriefing(marie)).reviewCount).toBe(1);
    expect((await buildBriefing(marie)).markdown.endsWith('1 élément à vérifier dans Leon.')).toBe(
      true,
    );
  });

  it('ignore un fait enregistré il y a 8 jours', async () => {
    const { tenantId, paul, ids } = await seedRightsScenario();
    const source = await seedSource(paul);
    const oldCard = await seedCard(tenantId, {
      title: 'Ancienne',
      typeSlug: 'client',
      acl: [tenantId],
      createdBy: paul.userId,
    });
    const oldFact = await seedFact(tenantId, {
      cardId: oldCard,
      ...source,
      authorId: paul.userId,
      predicate: 'note',
      statement: 'Fait vieux de huit jours.',
      acl: [tenantId],
    });
    const now = new Date();
    await adminDb
      .update(facts)
      .set({ recordedAt: new Date(now.getTime() - 8 * DAY) })
      .where(eq(facts.id, oldFact));
    await adminDb
      .update(facts)
      .set({ recordedAt: new Date(now.getTime() - 8 * DAY) })
      .where(eq(facts.id, ids.orionFact));

    const briefing = await buildBriefing(paul, now);

    expect(titlesOf(briefing)).toEqual(['ACME']);
  });

  it("énonce le fait visible le plus récent d'une fiche", async () => {
    const { tenantId, paul } = await seedRightsScenario();
    const source = await seedSource(paul);
    const card = await seedCard(tenantId, {
      title: 'Delta',
      typeSlug: 'client',
      acl: [tenantId],
      createdBy: paul.userId,
    });
    const base = { cardId: card, ...source, authorId: paul.userId, predicate: 'note' };
    const older = await seedFact(tenantId, {
      ...base,
      statement: 'Premier fait.',
      acl: [tenantId],
    });
    await seedFact(tenantId, { ...base, statement: 'Dernier fait.', acl: [tenantId] });
    await adminDb
      .update(facts)
      .set({ recordedAt: new Date(Date.now() - 2 * DAY) })
      .where(eq(facts.id, older));

    const briefing = await buildBriefing(paul);

    expect(briefing.entries.find((e) => e.title === 'Delta')?.latestStatement).toBe(
      'Dernier fait.',
    );
  });

  it('range les fiches de la plus récente à la plus ancienne', async () => {
    const { paul, ids } = await seedRightsScenario();
    await adminDb
      .update(facts)
      .set({ recordedAt: new Date(Date.now() - 3 * DAY) })
      .where(eq(facts.id, ids.orionFact));
    const briefing = await buildBriefing(paul);
    expect(briefing.entries.map((e) => e.title)).toEqual(['ACME', 'Orion']);
  });
});
