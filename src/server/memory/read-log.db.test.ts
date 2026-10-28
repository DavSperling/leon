import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { readLog, sources } from '@/server/db/schema/memory';
import { adminDb } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';
import { recordReads } from './read-log';

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
      tool: 'fetch',
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

describe('recordReads', () => {
  const readsOf = (sourceId: string) =>
    adminDb.select().from(readLog).where(eq(readLog.sourceId, sourceId));

  it('journalise la lecture avec l’accès de la source et le passage lu', async () => {
    const s = await seedScenario();
    const passageId = randomUUID();

    const written = await recordReads(s.paul, {
      tool: 'search',
      client: 'claude-code',
      reads: [{ sourceId: s.paulSourceId, passageId }],
    });

    expect(written).toEqual(new Set([s.paulSourceId]));
    const rows = await readsOf(s.paulSourceId);
    const row = rows.find((entry) => entry.passageId === passageId);
    expect(row).toMatchObject({
      tenantId: s.paul.tenantId,
      userId: s.paul.userId,
      client: 'claude-code',
      tool: 'search',
      sourceId: s.paulSourceId,
      acl: [s.paul.userId],
    });
  });

  it('journalise une lecture de source entière sans passage, avec l’accès d’équipe d’une source d’équipe', async () => {
    const s = await seedScenario();

    await recordReads(s.marie, {
      tool: 'fetch',
      client: 'cursor',
      reads: [{ sourceId: s.teamSourceId }],
    });

    const rows = await readsOf(s.teamSourceId);
    const row = rows.find((entry) => entry.client === 'cursor');
    expect(row).toMatchObject({ userId: s.marie.userId, passageId: null, acl: [s.marie.tenantId] });
  });

  it('n’écrit rien et rend false pour une source que le lecteur ne voit pas', async () => {
    const s = await seedScenario();
    const before = (await readsOf(s.paulSourceId)).length;

    const written = await recordReads(s.marie, {
      tool: 'fetch',
      client: 'claude-code',
      reads: [{ sourceId: s.paulSourceId }],
    });

    expect(written.size).toBe(0);
    expect(await readsOf(s.paulSourceId)).toHaveLength(before);
  });

  it('n’écrit rien pour une source d’une autre organisation', async () => {
    const s = await seedScenario();

    const written = await recordReads(s.zoe, {
      tool: 'fetch',
      client: 'claude-code',
      reads: [{ sourceId: s.paulSourceId }],
    });

    expect(written.size).toBe(0);
  });

  it('dans un lot, note les sources visibles et omet les autres', async () => {
    const s = await seedScenario();
    const before = (await readsOf(s.paulSourceId)).length;
    const [first, second] = [randomUUID(), randomUUID()];

    const written = await recordReads(s.marie, {
      tool: 'search',
      client: 'cursor',
      reads: [
        { sourceId: s.teamSourceId, passageId: first },
        { sourceId: s.paulSourceId, passageId: randomUUID() },
        { sourceId: s.teamSourceId, passageId: second },
      ],
    });

    expect(written).toEqual(new Set([s.teamSourceId]));
    const rows = (await readsOf(s.teamSourceId)).filter((row) => row.client === 'cursor');
    expect(rows.map((row) => row.passageId).sort()).toEqual([first, second].sort());
    expect(await readsOf(s.paulSourceId)).toHaveLength(before);
  });

  it('tout ou rien (whole) : une seule source invisible et rien n’est noté', async () => {
    const s = await seedScenario();
    const before = (await readsOf(s.teamSourceId)).length;

    const written = await recordReads(s.marie, {
      tool: 'briefing',
      client: 'chatgpt',
      reads: [{ sourceId: s.teamSourceId }, { sourceId: s.paulSourceId }],
      whole: true,
    });

    expect(written.size).toBe(0);
    expect(await readsOf(s.teamSourceId)).toHaveLength(before);
  });
});
