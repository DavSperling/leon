import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { readLog, sources } from '@/server/db/schema/memory';
import { adminDb } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';
import { listReadLog } from './read-log';

const ids = (entries: Array<{ id: string }>) => entries.map((entry) => entry.id);

async function seedRead(
  ctx: TenantContext,
  input: { sourceId: string; acl: string[]; client?: string; passageId?: string; at?: Date },
): Promise<string> {
  const [row] = await adminDb
    .insert(readLog)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      client: input.client ?? 'claude-code',
      sourceId: input.sourceId,
      passageId: input.passageId ?? null,
      acl: input.acl,
      at: input.at,
    })
    .returning({ id: readLog.id });
  if (!row) throw new Error('lecture de test non créée');
  return row.id;
}

// Paul et Marie dans une équipe, Zoé dans une autre. Une source privée à Paul, une source d'équipe (outil),
// une source de Zoé. Paul lit la sienne, Marie lit celle de l'équipe, Zoé lit la sienne.
async function seedScenario() {
  const team = await createTestTenant(['Paul Martin', 'Marie Durand']);
  const other = await createTestTenant(['Zoé Bernard']);
  const [paul, marie] = team.members as [TenantContext, TenantContext];
  const [zoe] = other.members as [TenantContext];
  const paulSource = await seedSource(paul, { kind: 'claude_code', title: 'Session ACME' });
  const [teamSource] = await adminDb
    .insert(sources)
    .values({
      tenantId: team.tenantId,
      kind: 'github',
      externalId: randomUUID(),
      ownerUserId: paul.userId,
      title: 'Ticket 12',
      acl: [team.tenantId],
    })
    .returning({ id: sources.id });
  if (!teamSource) throw new Error('source d’équipe non créée');
  const zoeSource = await seedSource(zoe, { kind: 'chatgpt', title: 'Relance ACME' });
  return {
    paul,
    marie,
    zoe,
    paulSourceId: paulSource.sourceId,
    teamSourceId: teamSource.id,
    paulRead: await seedRead(paul, { sourceId: paulSource.sourceId, acl: [paul.userId] }),
    marieRead: await seedRead(marie, {
      sourceId: teamSource.id,
      acl: [team.tenantId],
      client: 'interface',
    }),
    zoeRead: await seedRead(zoe, { sourceId: zoeSource.sourceId, acl: [zoe.userId] }),
  };
}

describe('listReadLog', () => {
  it('donne à Paul sa lecture de sa source et celle de Marie sur le ticket d’équipe', async () => {
    const s = await seedScenario();

    const entries = await listReadLog(s.paul, {});

    expect(ids(entries).sort()).toEqual([s.paulRead, s.marieRead].sort());
    expect(entries.find((entry) => entry.id === s.paulRead)).toMatchObject({
      client: 'claude-code',
      clientLabel: 'Claude Code',
      readerName: 'Paul Martin',
      sourceId: s.paulSourceId,
      sourceTitle: 'Session ACME',
      passageId: null,
    });
    expect(entries.find((entry) => entry.id === s.marieRead)).toMatchObject({
      client: 'interface',
      clientLabel: 'Interface',
      readerName: 'Marie Durand',
      sourceId: s.teamSourceId,
      sourceTitle: 'Ticket 12',
    });
  });

  it('ne donne pas à Marie la lecture de la source privée de Paul', async () => {
    const s = await seedScenario();

    const entries = await listReadLog(s.marie, {});

    expect(ids(entries)).toEqual([s.marieRead]);
    expect(JSON.stringify(entries)).not.toContain('Session ACME');
  });

  it('rend le passage lu quand la lecture en porte un', async () => {
    const s = await seedScenario();
    const passageId = randomUUID();
    const read = await seedRead(s.paul, {
      sourceId: s.paulSourceId,
      acl: [s.paul.userId],
      passageId,
    });

    const entries = await listReadLog(s.paul, { sourceId: s.paulSourceId });

    expect(entries.find((entry) => entry.id === read)?.passageId).toBe(passageId);
  });

  it('ne donne à Zoé rien de l’autre organisation', async () => {
    const s = await seedScenario();

    expect(ids(await listReadLog(s.zoe, {}))).toEqual([s.zoeRead]);
  });

  it('filtre sur une source', async () => {
    const s = await seedScenario();

    expect(ids(await listReadLog(s.paul, { sourceId: s.paulSourceId }))).toEqual([s.paulRead]);
    expect(ids(await listReadLog(s.paul, { sourceId: s.teamSourceId }))).toEqual([s.marieRead]);
  });

  it('classe la plus récente en premier et pagine avec before et limit', async () => {
    const s = await seedScenario();
    const at = (day: number) => new Date(`2026-10-${String(day).padStart(2, '0')}T10:00:00Z`);
    await adminDb
      .update(readLog)
      .set({ at: at(1) })
      .where(eq(readLog.id, s.paulRead));
    await adminDb
      .update(readLog)
      .set({ at: at(2) })
      .where(eq(readLog.id, s.marieRead));
    const newer = await seedRead(s.paul, {
      sourceId: s.paulSourceId,
      acl: [s.paul.userId],
      at: at(3),
    });

    const firstPage = await listReadLog(s.paul, { limit: 2 });
    const rest = await listReadLog(s.paul, { before: firstPage.at(-1)?.at, limit: 2 });

    expect(ids(firstPage)).toEqual([newer, s.marieRead]);
    expect(ids(rest)).toEqual([s.paulRead]);
  });

  it('nomme un client inconnu tel quel', async () => {
    const s = await seedScenario();
    await adminDb.update(readLog).set({ client: 'cursor' }).where(eq(readLog.id, s.paulRead));

    const entries = await listReadLog(s.paul, { sourceId: s.paulSourceId });

    expect(entries[0]).toMatchObject({ client: 'cursor', clientLabel: 'cursor' });
  });

  it('plafonne la page à 50 lectures par défaut', async () => {
    const s = await seedScenario();
    await adminDb.insert(readLog).values(
      Array.from({ length: 50 }, () => ({
        tenantId: s.paul.tenantId,
        userId: s.paul.userId,
        client: 'interface',
        sourceId: s.paulSourceId,
        acl: [s.paul.userId],
      })),
    );

    expect(await listReadLog(s.paul, {})).toHaveLength(50);
    expect(await listReadLog(s.paul, { limit: 60 })).toHaveLength(52);
  });
});
