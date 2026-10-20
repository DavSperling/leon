import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { readLog, sources } from '@/server/db/schema/memory';
import { adminDb } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';
import { recordRead } from './read-log';

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

describe('recordRead', () => {
  const readsOf = (sourceId: string) =>
    adminDb.select().from(readLog).where(eq(readLog.sourceId, sourceId));

  it('journalise la lecture avec l’accès de la source et le passage lu', async () => {
    const s = await seedScenario();
    const passageId = randomUUID();

    const written = await recordRead(s.paul, {
      sourceId: s.paulSourceId,
      passageId,
      client: 'claude-code',
    });

    expect(written).toBe(true);
    const rows = await readsOf(s.paulSourceId);
    const row = rows.find((entry) => entry.passageId === passageId);
    expect(row).toMatchObject({
      tenantId: s.paul.tenantId,
      userId: s.paul.userId,
      client: 'claude-code',
      sourceId: s.paulSourceId,
      acl: [s.paul.userId],
    });
  });

  it('journalise une lecture de source entière sans passage, avec l’accès d’équipe d’une source d’équipe', async () => {
    const s = await seedScenario();

    await recordRead(s.marie, { sourceId: s.teamSourceId, client: 'cursor' });

    const rows = await readsOf(s.teamSourceId);
    const row = rows.find((entry) => entry.client === 'cursor');
    expect(row).toMatchObject({ userId: s.marie.userId, passageId: null, acl: [s.marie.tenantId] });
  });

  it('n’écrit rien et rend false pour une source que le lecteur ne voit pas', async () => {
    const s = await seedScenario();
    const before = (await readsOf(s.paulSourceId)).length;

    const written = await recordRead(s.marie, { sourceId: s.paulSourceId, client: 'claude-code' });

    expect(written).toBe(false);
    expect(await readsOf(s.paulSourceId)).toHaveLength(before);
  });

  it('n’écrit rien pour une source d’une autre organisation', async () => {
    const s = await seedScenario();

    expect(await recordRead(s.zoe, { sourceId: s.paulSourceId, client: 'claude-code' })).toBe(
      false,
    );
  });
});
