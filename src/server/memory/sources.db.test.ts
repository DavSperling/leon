import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { SOURCE_KINDS } from '@/capture/turn';
import { ingestRuns, sources } from '@/server/db/schema/memory';
import { adminDb } from '@/test/db';
import { seedSource } from '@/test/fixtures';
import { seedRightsScenario } from '@/test/rights-scenario';
import { listSources } from './sources';

const lastCapture = (channels: Array<{ kind: string; lastCaptureAt: Date | null }>, kind: string) =>
  channels.find((channel) => channel.kind === kind)?.lastCaptureAt;

describe('listSources', () => {
  it("ne donne à Paul que sa source, avec ses tours et l'état de son pipeline", async () => {
    const { paul, ids } = await seedRightsScenario();

    const { sources: rows } = await listSources(paul);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: ids.paulSource,
      kind: 'claude_code',
      kindLabel: 'Claude Code',
      title: 'Session ACME',
      turnCount: 1,
      lastRun: { status: 'queued', step: 'triage' },
    });
  });

  it('ne donne à Marie que sa source, sans exécution du pipeline, et rien de celle de Paul', async () => {
    const { marie, ids } = await seedRightsScenario();

    const { sources: rows, channels } = await listSources(marie);

    expect(rows.map((row) => row.id)).toEqual([ids.marieSource]);
    expect(rows[0]).toMatchObject({ kindLabel: 'ChatGPT', turnCount: 1, lastRun: null });
    expect(JSON.stringify({ rows, channels })).not.toContain('Session ACME');
    expect(lastCapture(channels, 'claude_code')).toBeNull();
  });

  it("ne donne à Zoé rien de l'autre organisation", async () => {
    const { zoe, ids } = await seedRightsScenario();

    const { sources: rows } = await listSources(zoe);

    expect(rows).toHaveLength(1);
    expect(rows.map((row) => row.id)).not.toContain(ids.paulSource);
  });

  it("donne une entrée par canal, dans l'ordre des types, avec la dernière capture de l'utilisateur", async () => {
    const { paul, marie } = await seedRightsScenario();
    const older = await seedSource(paul, { kind: 'claude_ai', title: 'Ancienne' });
    const newer = await seedSource(paul, { kind: 'claude_ai', title: 'Récente' });
    await adminDb
      .update(sources)
      .set({ lastTurnAt: new Date('2026-10-01T10:00:00Z') })
      .where(eq(sources.id, older.sourceId));
    await adminDb
      .update(sources)
      .set({ lastTurnAt: new Date('2026-10-12T09:30:00Z') })
      .where(eq(sources.id, newer.sourceId));

    const { channels } = await listSources(paul);
    const forMarie = await listSources(marie);

    expect(channels.map((channel) => channel.kind)).toEqual([...SOURCE_KINDS]);
    expect(channels.map((channel) => channel.kindLabel)).toEqual([
      'Claude Code',
      'claude.ai',
      'ChatGPT',
      'Note MCP',
    ]);
    expect(lastCapture(channels, 'claude_ai')).toEqual(new Date('2026-10-12T09:30:00Z'));
    expect(lastCapture(channels, 'claude_code')).toBeInstanceOf(Date);
    expect(lastCapture(channels, 'chatgpt')).toBeNull();
    expect(lastCapture(forMarie.channels, 'claude_ai')).toBeNull();
  });

  it("donne l'exécution la plus récente de la source, étape comprise", async () => {
    const { paul, ids } = await seedRightsScenario();
    await adminDb
      .update(ingestRuns)
      .set({ status: 'done', step: 'done' })
      .where(eq(ingestRuns.id, ids.paulRun));
    await adminDb.insert(ingestRuns).values({
      tenantId: paul.tenantId,
      sourceId: ids.paulSource,
      turnIds: [ids.paulTurn],
      status: 'failed',
      step: 'extraction',
      acl: [paul.userId],
      createdAt: new Date(Date.now() + 60_000),
    });

    const { sources: rows } = await listSources(paul);

    expect(rows[0]?.lastRun).toMatchObject({ status: 'failed', step: 'extraction' });
  });

  it('ne laisse sortir ni texte de tour ni message d’erreur', async () => {
    const { paul } = await seedRightsScenario();
    const secret = await seedSource(paul, {
      title: 'Session visible',
      text: 'texte-de-tour-secret',
    });
    await adminDb.insert(ingestRuns).values({
      tenantId: paul.tenantId,
      sourceId: secret.sourceId,
      turnIds: [secret.turnId],
      status: 'failed',
      step: 'placement',
      error: 'message-technique-secret',
      acl: [paul.userId],
    });

    const result = await listSources(paul);

    const json = JSON.stringify(result);
    expect(json).toContain('Session visible');
    expect(json).not.toContain('texte-de-tour-secret');
    expect(json).not.toContain('message-technique-secret');
  });

  it('classe les sources par dernier tour, la plus récente en premier', async () => {
    const { paul } = await seedRightsScenario();
    const old = await seedSource(paul, { title: 'Vieille session' });
    await adminDb
      .update(sources)
      .set({ lastTurnAt: new Date('2020-01-01T00:00:00Z') })
      .where(eq(sources.id, old.sourceId));

    const { sources: rows } = await listSources(paul);

    expect(rows.at(-1)?.title).toBe('Vieille session');
  });
});
