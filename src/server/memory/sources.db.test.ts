import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { SourceKind } from '@/capture/turn';
import { CAPTURE_KINDS } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestRuns, sources, turns } from '@/server/db/schema/memory';
import { adminDb } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';
import { channelHealth, listSources } from './sources';

const lastCapture = (channels: Array<{ kind: string; lastCaptureAt: Date | null }>, kind: string) =>
  channels.find((channel) => channel.kind === kind)?.lastCaptureAt;

// Une source visible de toute l'équipe, comme celles que posent les connexions.
async function seedTeamSource(
  owner: TenantContext,
  input: { kind: SourceKind; title: string; metadata?: Record<string, unknown> },
): Promise<string> {
  const [source] = await adminDb
    .insert(sources)
    .values({
      tenantId: owner.tenantId,
      kind: input.kind,
      externalId: randomUUID(),
      ownerUserId: owner.userId,
      title: input.title,
      acl: [owner.tenantId],
      metadata: input.metadata ?? {},
      lastTurnAt: new Date(),
    })
    .returning({ id: sources.id });
  if (!source) throw new Error('source de test non créée');
  return source.id;
}

// Paul et Marie dans une équipe, Zoé dans une autre. Paul a une session Claude Code (avec un run d'indexation
// en attente), Marie une conversation ChatGPT, Zoé une conversation à elle.
async function seedRightsScenario() {
  const team = await createTestTenant(['Paul Martin', 'Marie Durand']);
  const other = await createTestTenant(['Zoé Bernard']);
  const [paul, marie] = team.members as [TenantContext, TenantContext];
  const [zoe] = other.members as [TenantContext];
  const paulSource = await seedSource(paul, { kind: 'claude_code', title: 'Session ACME' });
  const marieSource = await seedSource(marie, { kind: 'chatgpt', title: 'Relance ACME' });
  await seedSource(zoe, { kind: 'chatgpt', title: 'Relance ACME' });
  const [run] = await adminDb
    .insert(ingestRuns)
    .values({
      tenantId: paul.tenantId,
      sourceId: paulSource.sourceId,
      turnIds: [paulSource.turnId],
      acl: [paul.userId],
    })
    .returning({ id: ingestRuns.id });
  if (!run) throw new Error('run de test non créé');
  return {
    paul,
    marie,
    zoe,
    ids: {
      paulSource: paulSource.sourceId,
      paulTurn: paulSource.turnId,
      marieSource: marieSource.sourceId,
      paulRun: run.id,
    },
  };
}

describe('listSources', () => {
  it("ne donne à Paul que sa source, avec ses tours et l'état de son indexation", async () => {
    const { paul, ids } = await seedRightsScenario();

    const { sources: rows } = await listSources(paul);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: ids.paulSource,
      kind: 'claude_code',
      kindLabel: 'Claude Code',
      title: 'Session ACME',
      turnCount: 1,
      lastRun: { status: 'queued', step: 'index' },
    });
  });

  it('ne compte pas le résumé de Leon parmi les tours, ni son indexation comme dernier run (T23)', async () => {
    const { paul, ids } = await seedRightsScenario();
    const [resume] = await adminDb
      .insert(turns)
      .values({
        tenantId: paul.tenantId,
        sourceId: ids.paulSource,
        externalId: 'leon:resume:1',
        role: 'document',
        text: "## Où j'en suis",
        ts: new Date(),
        captureMode: 'manual',
        acl: [paul.userId],
      })
      .returning({ id: turns.id });
    await adminDb.insert(ingestRuns).values({
      tenantId: paul.tenantId,
      sourceId: ids.paulSource,
      turnIds: [resume?.id ?? ''],
      acl: [paul.userId],
      status: 'done',
      step: 'done',
    });

    const { sources: rows } = await listSources(paul);

    expect(rows[0]).toMatchObject({ turnCount: 1, lastRun: { status: 'queued', step: 'index' } });
  });

  it('ne donne à Marie que sa source, sans indexation, et rien de celle de Paul', async () => {
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

    expect(channels.map((channel) => channel.kind)).toEqual([...CAPTURE_KINDS]);
    expect(channels.map((channel) => channel.kindLabel)).toEqual([
      'Claude Code',
      'claude.ai',
      'ChatGPT',
      'Note (MCP)',
    ]);
    expect(lastCapture(channels, 'claude_ai')).toEqual(new Date('2026-10-12T09:30:00Z'));
    expect(lastCapture(channels, 'claude_code')).toBeInstanceOf(Date);
    expect(lastCapture(channels, 'chatgpt')).toBeNull();
    expect(lastCapture(forMarie.channels, 'claude_ai')).toBeNull();
  });

  it('channelHealth donne la même santé par canal que listSources, sans lire les sources', async () => {
    const { paul } = await seedRightsScenario();
    await seedSource(paul, { kind: 'claude_ai', title: 'Récente' });

    const { channels } = await listSources(paul);

    expect(await channelHealth(paul)).toEqual(channels);
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
      step: 'index',
      acl: [paul.userId],
      createdAt: new Date(Date.now() + 60_000),
    });

    const { sources: rows } = await listSources(paul);

    expect(rows[0]?.lastRun).toMatchObject({ status: 'failed', step: 'index' });
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
      step: 'index',
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

  it('rend 50 sources par page, les plus récentes d’abord, et dit s’il en reste', async () => {
    const { paul, ids } = await seedRightsScenario();
    const start = new Date('2026-01-01T00:00:00Z').getTime();
    await adminDb.insert(sources).values(
      Array.from({ length: 51 }, (_, index) => ({
        tenantId: paul.tenantId,
        kind: 'claude_code' as const,
        externalId: randomUUID(),
        ownerUserId: paul.userId,
        title: `Source ${index}`,
        acl: [paul.userId],
        lastTurnAt: new Date(start - index * 86_400_000),
      })),
    );

    const first = await listSources(paul);
    const second = await listSources(paul, 2);

    expect(first.sources).toHaveLength(50);
    expect(first.hasNext).toBe(true);
    expect(first.sources[0]).toMatchObject({ id: ids.paulSource, turnCount: 1 });
    expect(first.sources.at(-1)?.title).toBe('Source 48');
    expect(second.sources.map((row) => row.title)).toEqual(['Source 49', 'Source 50']);
    expect(second.hasNext).toBe(false);
    // La santé des canaux ne dépend pas de la page.
    expect(lastCapture(second.channels, 'claude_code')).toEqual(
      lastCapture(first.channels, 'claude_code'),
    );
    expect(lastCapture(second.channels, 'claude_code')).toEqual(first.sources[0]?.lastTurnAt);
  });

  it("donne à Marie la source d'outil de Paul, avec le lien vers l'original", async () => {
    const { marie, paul, ids } = await seedRightsScenario();
    const github = await seedTeamSource(paul, {
      kind: 'github',
      title: 'Ticket 12 : choisir la base',
      metadata: { nature: 'ticket', url: 'https://github.com/acme/leon/issues/12' },
    });

    const { sources: rows } = await listSources(marie);

    expect(rows.map((row) => row.id).sort()).toEqual([ids.marieSource, github].sort());
    expect(rows.find((row) => row.id === github)).toMatchObject({
      kind: 'github',
      kindLabel: 'GitHub',
      title: 'Ticket 12 : choisir la base',
      url: 'https://github.com/acme/leon/issues/12',
    });
    expect(rows.find((row) => row.id === ids.marieSource)?.url).toBeNull();
  });

  it("ne donne pas à Marie une conversation de Paul, même posée avec une ACL d'équipe", async () => {
    const { marie, paul } = await seedRightsScenario();
    const shared = await seedTeamSource(paul, { kind: 'claude_code', title: 'Session partagée' });

    const { sources: rows, channels } = await listSources(marie);

    expect(rows.map((row) => row.id)).not.toContain(shared);
    expect(lastCapture(channels, 'claude_code')).toBeNull();
  });

  it("ne donne rien d'une source d'outil à l'autre organisation", async () => {
    const { zoe, paul, ids } = await seedRightsScenario();
    const page = await seedTeamSource(paul, { kind: 'notion', title: 'Page produit' });

    const { sources: rows } = await listSources(zoe);

    expect(rows.map((row) => row.id)).not.toContain(page);
    expect(rows.map((row) => row.id)).not.toContain(ids.paulSource);
  });

  it('garde un lien http, comme la recherche', async () => {
    const { paul } = await seedRightsScenario();
    const source = await seedTeamSource(paul, {
      kind: 'linear',
      title: 'Ticket en http',
      metadata: { url: 'http://exemple.test/a' },
    });

    const { sources: rows } = await listSources(paul);

    expect(rows.find((row) => row.id === source)?.url).toBe('http://exemple.test/a');
  });

  it.each([
    ['un lien javascript', 'javascript:alert(1)'],
    ['un lien javascript en majuscules', 'JavaScript:alert(1)'],
    ['une valeur qui n’est pas du texte', 42],
    ['aucune adresse', undefined],
  ])('ne garde pas le lien quand il est %s', async (_label, url) => {
    const { paul } = await seedRightsScenario();
    const source = await seedTeamSource(paul, {
      kind: 'linear',
      title: 'Ticket sans lien sûr',
      metadata: url === undefined ? {} : { url },
    });

    const { sources: rows } = await listSources(paul);

    expect(rows.find((row) => row.id === source)?.url).toBeNull();
  });
});
