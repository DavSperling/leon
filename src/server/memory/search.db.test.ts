import { eq, inArray } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { cards, facts } from '@/server/db/schema/memory';
import { adminDb } from '@/test/db';
import { seedCard, seedFact } from '@/test/fixtures';
import { seedRightsScenario } from '@/test/rights-scenario';
import { cardUrl } from './card-url';
import { searchMemory } from './search';

const idsOf = (results: Array<{ id: string }>) => results.map((r) => r.id);
const HOUR = 3600 * 1000;

describe('searchMemory', () => {
  it('trouve le fait privé de Paul pour Paul seulement', async () => {
    const { paul, marie, ids } = await seedRightsScenario();
    expect(idsOf(await searchMemory(paul, { query: 'zanzibar' }))).toEqual([ids.acmeCard]);
    expect(await searchMemory(marie, { query: 'zanzibar' })).toEqual([]);
  });

  it('trouve la fiche privée Orion pour Paul seulement', async () => {
    const { paul, marie, ids } = await seedRightsScenario();
    expect(idsOf(await searchMemory(paul, { query: 'Orion' }))).toEqual([ids.orionCard]);
    expect(await searchMemory(marie, { query: 'Orion' })).toEqual([]);
  });

  it("ne sort jamais de l'organisation du lecteur", async () => {
    const { paul, marie, zoe, ids } = await seedRightsScenario();
    expect(idsOf(await searchMemory(paul, { query: 'quarante-cinq' }))).toEqual([ids.acmeCard]);
    expect(idsOf(await searchMemory(marie, { query: 'quarante-cinq' }))).toEqual([ids.acmeCard]);
    expect(idsOf(await searchMemory(zoe, { query: 'quarante-cinq' }))).toEqual([ids.zoeCard]);
  });

  it('renvoie le type, la date de mise à jour et le lien de la fiche', async () => {
    const { marie, ids } = await seedRightsScenario();
    const [result] = await searchMemory(marie, { query: 'quarante-cinq' });
    expect(result).toMatchObject({
      id: ids.acmeCard,
      title: 'ACME',
      typeSlug: 'client',
      typeLabel: 'Client',
      url: cardUrl(ids.acmeCard),
      matchedFact: {
        id: ids.acmeTeamFact,
        statement: 'ACME paie ses factures à quarante-cinq jours.',
      },
    });
    expect(result?.updatedAt).toBeInstanceOf(Date);
  });

  it('filtre par type, types dérivés compris', async () => {
    const { tenantId, paul, ids } = await seedRightsScenario();
    const chantier = await seedCard(tenantId, {
      title: 'Orion Nord',
      typeSlug: 'chantier',
      acl: [paul.userId],
      createdBy: paul.userId,
    });
    const found = idsOf(await searchMemory(paul, { query: 'Orion', type: 'projet' }));
    expect(found.sort()).toEqual([ids.orionCard, chantier].sort());
    expect(await searchMemory(paul, { query: 'Orion', type: 'client' })).toEqual([]);
  });

  it('filtre sur la date d’enregistrement des faits visibles', async () => {
    const { paul, ids } = await seedRightsScenario();
    const pastHour = new Date(Date.now() - HOUR);
    const nextHour = new Date(Date.now() + HOUR);
    expect(idsOf(await searchMemory(paul, { query: 'ACME', since: pastHour }))).toEqual([
      ids.acmeCard,
    ]);
    expect(await searchMemory(paul, { query: 'ACME', since: nextHour })).toEqual([]);
  });

  it('ne fait pas remonter une fiche par un fait récent invisible au lecteur', async () => {
    const { paul, marie, ids } = await seedRightsScenario();
    await adminDb
      .update(facts)
      .set({ recordedAt: new Date(Date.now() - 48 * HOUR) })
      .where(inArray(facts.id, [ids.acmeTeamFact, ids.acmeConflictFact]));
    const pastHour = new Date(Date.now() - HOUR);
    expect(await searchMemory(marie, { query: 'ACME', since: pastHour })).toEqual([]);
    expect(idsOf(await searchMemory(paul, { query: 'ACME', since: pastHour }))).toEqual([
      ids.acmeCard,
    ]);
  });

  it('borne le nombre de résultats (8 par défaut, 20 au plus)', async () => {
    const { tenantId, paul } = await seedRightsScenario();
    for (let i = 0; i < 22; i++) {
      await seedCard(tenantId, { title: `Gamma ${i}`, typeSlug: 'outil', acl: [tenantId] });
    }
    expect(await searchMemory(paul, { query: 'Gamma' })).toHaveLength(8);
    expect(await searchMemory(paul, { query: 'Gamma', limit: 50 })).toHaveLength(20);
  });

  it("ne tire l'extrait et le fait trouvé que de faits visibles", async () => {
    const { tenantId, paul, marie, ids } = await seedRightsScenario();
    for (const result of await searchMemory(marie, { query: 'ACME' })) {
      expect(result.snippet).not.toContain('zanzibar');
      expect(result.matchedFact?.statement ?? '').not.toContain('zanzibar');
    }
    await seedFact(tenantId, {
      cardId: ids.acmeCard,
      sourceId: ids.paulSource,
      turnId: ids.paulTurn,
      authorId: paul.userId,
      predicate: 'note',
      statement: `ACME prépare un appel d'offres pélican ${'très '.repeat(60)}long.`,
      acl: [tenantId],
    });
    const [result] = await searchMemory(marie, { query: 'pélican' });
    expect(result?.snippet.length).toBeLessThanOrEqual(160);
    expect(result?.snippet.endsWith('…')).toBe(true);
  });

  it('donne un extrait à une fiche trouvée par son seul nom', async () => {
    const { marie, ids } = await seedRightsScenario();
    const [result] = await searchMemory(marie, { query: 'acme.fr' });
    expect(result?.id).toBe(ids.acmeCard);
    expect(result?.matchedFact).toBeNull();
    expect(result?.snippet).toMatch(/ACME paie ses factures/);
  });

  it('exclut les fiches fusionnées', async () => {
    const { tenantId, marie, ids } = await seedRightsScenario();
    const merged = await seedCard(tenantId, {
      title: 'Hélios',
      typeSlug: 'client',
      acl: [tenantId],
    });
    await adminDb.update(cards).set({ mergedInto: ids.acmeCard }).where(eq(cards.id, merged));
    expect(await searchMemory(marie, { query: 'Hélios' })).toEqual([]);
  });

  it('traite % et _ comme du texte', async () => {
    const { marie } = await seedRightsScenario();
    expect(await searchMemory(marie, { query: '%' })).toEqual([]);
    expect(await searchMemory(marie, { query: '%_%_' })).toEqual([]);
  });
});
