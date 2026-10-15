import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestRuns } from '@/server/db/schema/memory';
import { llmUsage } from '@/server/db/schema/usage';
import * as log from '@/server/log';
import type { PipelineJob } from '@/server/pipeline/queue';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';
import type { Llm, LlmUsage } from './llm';
import { recordingUsage, recordLlmUsage } from './record-usage';

afterEach(() => vi.restoreAllMocks());

describe('llm_usage', () => {
  it('RLS active ; leon_app insère mais ne lit, ne modifie ni ne supprime', async () => {
    const { rows } = await adminPool.query(
      `select relrowsecurity as rls,
              has_table_privilege('leon_app', 'llm_usage', 'INSERT') as can_insert,
              has_table_privilege('leon_app', 'llm_usage', 'SELECT') as can_select,
              has_table_privilege('leon_app', 'llm_usage', 'UPDATE') as can_update,
              has_table_privilege('leon_app', 'llm_usage', 'DELETE') as can_delete
         from pg_class where relname = 'llm_usage' and relkind = 'r'`,
    );
    expect(rows).toEqual([
      { rls: true, can_insert: true, can_select: false, can_update: false, can_delete: false },
    ]);
  });
});

const USAGE: LlmUsage = {
  step: 'extraction',
  model: 'claude-sonnet-5-5',
  inputTokens: 1200,
  outputTokens: 300,
  cacheReadTokens: 800,
  cacheWriteTokens: 0,
  costUsd: 0.00548,
};

// Faux client qui « facture » chaque appel avec USAGE (ou l'usage donné).
function billingLlm(usage: LlmUsage = USAGE): Llm {
  return {
    async generateObject(request) {
      await request.onUsage?.({ ...usage, step: request.step });
      return request.schema.parse({ answer: 'oui' });
    },
  };
}

async function seedJob(): Promise<PipelineJob> {
  const { tenantId, members } = await createTestTenant(['Paul']);
  const [paul] = members as [TenantContext];
  const { sourceId, turnId } = await seedSource(paul);
  const [run] = await adminDb
    .insert(ingestRuns)
    .values({ tenantId, sourceId, turnIds: [turnId], acl: [paul.userId] })
    .returning({ id: ingestRuns.id });
  if (!run) throw new Error('run de test non créé');
  return { ingestRunId: run.id, tenantId, userId: paul.userId };
}

const rowsOf = (job: PipelineJob) =>
  adminDb.select().from(llmUsage).where(eq(llmUsage.ingestRunId, job.ingestRunId));

const ask = (llm: Llm, step: 'triage' | 'juge' = 'triage') =>
  llm.generateObject({
    step,
    system: 's',
    prompt: 'p',
    schema: z.object({ answer: z.string() }),
    maxTokens: 10,
  });

describe('recordingUsage', () => {
  it('enregistre chaque appel avec l organisation et le run du job', async () => {
    const job = await seedJob();

    await ask(recordingUsage(billingLlm(), job));

    expect(await rowsOf(job)).toEqual([
      expect.objectContaining({
        tenantId: job.tenantId,
        step: 'triage',
        model: 'claude-sonnet-5-5',
        inputTokens: 1200,
        outputTokens: 300,
        cacheReadTokens: 800,
        cacheWriteTokens: 0,
        costUsd: '0.00548000',
      }),
    ]);
  });

  it('n enregistre pas le juge, qui n est pas une étape du pipeline', async () => {
    const job = await seedJob();

    await ask(recordingUsage(billingLlm(), job), 'juge');

    expect(await rowsOf(job)).toEqual([]);
  });
});

describe('recordLlmUsage', () => {
  it('journalise un échec d écriture sans lever', async () => {
    const job = await seedJob();
    const spy = vi.spyOn(log, 'logError').mockImplementation(() => {});
    const invalid = { ...USAGE, inputTokens: Number.NaN };

    await expect(recordLlmUsage(job, invalid)).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledWith('llm.usage_record_failed', expect.anything(), {
      runId: job.ingestRunId,
    });
  });
});
