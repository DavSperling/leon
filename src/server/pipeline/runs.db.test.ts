import { DrizzleQueryError, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Turn } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestRuns } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { ingestTurns } from '@/server/ingest/ingest-turns';
import { createTestTenant } from '@/test/fixtures';
import { enqueuePipelineStep } from './queue';
import { failRun } from './runs';

vi.mock('@/server/pipeline/queue');

beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());

const turn: Turn = {
  external_id: 'msg-1',
  role: 'user',
  text: 'Texte du tour',
  ts: '2026-10-13T09:01:00Z',
  capture_mode: 'network',
};

async function setup() {
  const { members } = await createTestTenant(['Paul', 'Marie']);
  const [paul, marie] = members as [TenantContext, TenantContext];
  const { ingestRunId } = await ingestTurns(paul, {
    source: { kind: 'claude_code', external_id: crypto.randomUUID(), title: 'Session ACME' },
    turns: [turn],
  });
  if (!ingestRunId) throw new Error('run non créé');
  return { paul, marie, runId: ingestRunId };
}

const readRun = (ctx: TenantContext, runId: string) =>
  withTenant(ctx, async (tx) => {
    const [run] = await tx.select().from(ingestRuns).where(eq(ingestRuns.id, runId));
    return run;
  });

describe('failRun', () => {
  it('marque le run failed avec un résumé court de l’erreur, sans changer d’étape', async () => {
    const { paul, runId } = await setup();

    await failRun(paul, runId, new Error('x'.repeat(500)));

    const run = await readRun(paul, runId);
    expect(run?.status).toBe('failed');
    expect(run?.step).toBe('index');
    expect(run?.error).toBe(`Error: ${'x'.repeat(193)}`);
    expect(run?.error?.length).toBeLessThanOrEqual(200);
  });

  it('n’écrit pas les paramètres d’une erreur de base', async () => {
    const { paul, runId } = await setup();
    const error = new DrizzleQueryError('insert into turns …', ['zanzibar'], new Error('pg'));

    await failRun(paul, runId, error);

    const run = await readRun(paul, runId);
    expect(run?.error).toBeTruthy();
    expect(run?.error).not.toContain('zanzibar');
    expect(run?.error).not.toContain('insert into');
  });

  it('ne laisse pas Marie marquer en échec le run de Paul', async () => {
    const { marie, paul, runId } = await setup();

    await failRun(marie, runId, new Error('échec'));

    expect(await readRun(paul, runId)).toMatchObject({ status: 'queued', error: null });
  });
});
