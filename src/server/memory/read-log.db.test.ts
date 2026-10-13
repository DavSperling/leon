import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { readLog } from '@/server/db/schema/memory';
import { adminDb } from '@/test/db';
import { seedRightsScenario } from '@/test/rights-scenario';
import { listReadLog } from './read-log';

const ids = (entries: Array<{ id: string }>) => entries.map((entry) => entry.id);

describe('listReadLog', () => {
  it('donne à Paul sa lecture de la fiche Orion et celle de Marie sur ACME', async () => {
    const { paul, ids: s } = await seedRightsScenario();

    const entries = await listReadLog(paul, {});

    expect(ids(entries).sort()).toEqual([s.paulReadOrion, s.marieReadAcme].sort());
    expect(entries.find((entry) => entry.id === s.paulReadOrion)).toMatchObject({
      client: 'claude-code',
      clientLabel: 'Claude Code',
      readerName: 'Paul Martin',
      cardId: s.orionCard,
      cardTitle: 'Orion',
    });
    expect(entries.find((entry) => entry.id === s.marieReadAcme)).toMatchObject({
      client: 'interface',
      clientLabel: 'Interface',
      readerName: 'Marie Durand',
      cardId: s.acmeCard,
      cardTitle: 'ACME',
    });
  });

  it('ne donne pas à Marie la lecture de la fiche privée de Paul', async () => {
    const { marie, ids: s } = await seedRightsScenario();

    const entries = await listReadLog(marie, {});

    expect(ids(entries)).toEqual([s.marieReadAcme]);
    expect(JSON.stringify(entries)).not.toContain('Orion');
  });

  it("ne donne à Zoé rien de l'autre organisation", async () => {
    const { zoe } = await seedRightsScenario();

    expect(await listReadLog(zoe, {})).toEqual([]);
  });

  it('filtre sur une fiche', async () => {
    const { paul, ids: s } = await seedRightsScenario();

    expect(ids(await listReadLog(paul, { cardId: s.orionCard }))).toEqual([s.paulReadOrion]);
    expect(ids(await listReadLog(paul, { cardId: s.acmeCard }))).toEqual([s.marieReadAcme]);
  });

  it('classe la plus récente en premier et pagine avec before et limit', async () => {
    const { paul, ids: s } = await seedRightsScenario();
    const at = (day: number) => new Date(`2026-10-${String(day).padStart(2, '0')}T10:00:00Z`);
    await adminDb
      .update(readLog)
      .set({ at: at(1) })
      .where(eq(readLog.id, s.paulReadOrion));
    await adminDb
      .update(readLog)
      .set({ at: at(2) })
      .where(eq(readLog.id, s.marieReadAcme));
    const newer = await adminDb
      .insert(readLog)
      .values({
        tenantId: paul.tenantId,
        userId: paul.userId,
        client: 'claude-code',
        cardId: s.orionCard,
        acl: [paul.userId],
        at: at(3),
      })
      .returning({ id: readLog.id });
    const newerId = newer[0]?.id ?? '';

    const firstPage = await listReadLog(paul, { limit: 2 });
    const rest = await listReadLog(paul, { before: firstPage.at(-1)?.at, limit: 2 });

    expect(ids(firstPage)).toEqual([newerId, s.marieReadAcme]);
    expect(ids(rest)).toEqual([s.paulReadOrion]);
  });

  it('nomme un client inconnu tel quel', async () => {
    const { paul, ids: s } = await seedRightsScenario();
    await adminDb.update(readLog).set({ client: 'cursor' }).where(eq(readLog.id, s.paulReadOrion));

    const entries = await listReadLog(paul, { cardId: s.orionCard });

    expect(entries[0]).toMatchObject({ client: 'cursor', clientLabel: 'cursor' });
  });

  it('plafonne la page à 50 lectures par défaut', async () => {
    const { paul, ids: s } = await seedRightsScenario();
    await adminDb.insert(readLog).values(
      Array.from({ length: 50 }, () => ({
        tenantId: paul.tenantId,
        userId: paul.userId,
        client: 'interface',
        cardId: s.orionCard,
        acl: [paul.userId],
      })),
    );

    expect(await listReadLog(paul, {})).toHaveLength(50);
    expect(await listReadLog(paul, { limit: 60 })).toHaveLength(52);
  });
});
