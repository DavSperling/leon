import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestRuns } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { createFakeLlm } from '@/server/llm/fake-llm';
import { LlmError } from '@/server/llm/llm';
import { adminDb } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';
import { readPromptJson } from '@/test/llm-prompt';
import { runPipelineNow } from '@/test/run-pipeline-now';
import type { PlacementContext } from './placement/context';
import { enqueuePipelineStep, getBoss, PIPELINE_QUEUES, type PipelineJob } from './queue';
import { startPipelineWorker } from './worker';

const FAILING_TEXT = 'Texte confidentiel du tour qui fait échouer le triage.';
const FACT_TEXT = 'ACME paie ses factures à soixante jours.';

// Le worker est un singleton par process : un seul faux LLM, aiguillé par l'étape et le texte du tour.
const llm = createFakeLlm((request) => {
  if (request.prompt.includes(FAILING_TEXT)) throw new LlmError('refus du modèle');
  if (request.step === 'triage')
    return { keep: true, reason: 'Un tarif.', sensitiveTurns: [], usefulTurns: [] };
  if (request.step === 'extraction') {
    const turnExternalId = /<tour id="([^"]+)"/.exec(request.prompt)?.[1];
    return {
      facts: [
        {
          turnExternalId,
          statement: FACT_TEXT,
          typeHint: 'client',
          predicate: 'note',
          value: null,
          subject: { name: 'ACME', email: null, domain: null },
          otherMentions: [],
          quote: FACT_TEXT,
          validFrom: null,
          validTo: null,
          confidence: 0.9,
          assertion: 'etabli',
          sensitive: false,
          sensitiveCategory: null,
        },
      ],
    };
  }
  const context = readPromptJson(request.prompt, 'contexte') as PlacementContext;
  return {
    decisions: context.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      decision: 'new',
      cardId: null,
      newCardTitle: candidate.subject.name,
      typeSlug: candidate.typeHint,
      proposedType: null,
      relation: 'new',
      relatedFactId: null,
      reason: 'Entité nouvelle.',
    })),
  };
});

beforeAll(() => startPipelineWorker(llm, { pollingIntervalSeconds: 0.5 }));

afterAll(async () => {
  await (await getBoss()).stop();
});

// Run à l'étape `triage`, inséré sans passer par l'ingestion (qui met elle-même le triage en file).
async function seedTriageRun(text = FACT_TEXT) {
  const { tenantId, members } = await createTestTenant(['Paul']);
  const [paul] = members as [TenantContext];
  const { sourceId, turnId } = await seedSource(paul, { text });
  const [run] = await adminDb
    .insert(ingestRuns)
    .values({ tenantId, sourceId, turnIds: [turnId], acl: [paul.userId] })
    .returning({ id: ingestRuns.id });
  if (!run) throw new Error('run de test non créé');
  const job: PipelineJob = { ingestRunId: run.id, tenantId, userId: paul.userId };
  return { paul, job };
}

const readRun = (ctx: TenantContext, runId: string) =>
  withTenant(ctx, async (tx) => {
    const [run] = await tx.select().from(ingestRuns).where(eq(ingestRuns.id, runId));
    return run;
  });

async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

describe('worker du pipeline', () => {
  it('mène un run mis en file jusqu à done, étape après étape', async () => {
    const { paul, job } = await seedTriageRun();

    await enqueuePipelineStep('triage', job);

    const run = await waitFor(
      () => readRun(paul, job.ingestRunId),
      (r) => r?.status === 'done',
    );
    expect(run).toMatchObject({ status: 'done', step: 'done' });
    expect(llm.calls.map((call) => call.step)).toEqual(
      expect.arrayContaining(['triage', 'extraction', 'placement']),
    );
  });

  it('reprend un run dont la mise en file de l etape suivante a échoué', async () => {
    const { paul, job } = await seedTriageRun();
    const boss = await getBoss();
    const send = boss.send.bind(boss);
    let failed = false;
    vi.spyOn(boss, 'send').mockImplementation((...args: Parameters<typeof send>) => {
      if (args[0] !== PIPELINE_QUEUES.extraction || failed) return send(...args);
      failed = true;
      return Promise.reject(new Error('pg-boss indisponible'));
    });
    const jobId = await boss.send(PIPELINE_QUEUES.triage, job, { retryLimit: 1, retryDelay: 1 });
    if (!jobId) throw new Error('job non créé');

    const run = await waitFor(
      () => readRun(paul, job.ingestRunId),
      (r) => r?.status === 'done',
    );
    vi.restoreAllMocks();

    expect(failed).toBe(true);
    expect(run).toMatchObject({ status: 'done', step: 'done' });
  });

  it('marque le run failed sans texte de tour et ne laisse aucun job à reprendre', async () => {
    const { paul, job } = await seedTriageRun(FAILING_TEXT);

    const boss = await getBoss();
    const jobId = await boss.send(PIPELINE_QUEUES.triage, job, { retryLimit: 0 });
    if (!jobId) throw new Error('job non créé');

    const pgJob = await waitFor(
      () => boss.getJobById(PIPELINE_QUEUES.triage, jobId),
      (j) => j?.state === 'failed',
    );
    expect(pgJob?.state).toBe('failed');
    const run = await readRun(paul, job.ingestRunId);
    expect(run?.status).toBe('failed');
    expect(run?.error).toBe('LlmError: refus du modèle');
    expect(run?.error).not.toContain(FAILING_TEXT);
  });
});

describe('runPipelineNow', () => {
  it('amène un run à done sans pg-boss', async () => {
    const { paul, job } = await seedTriageRun();

    await runPipelineNow(job, llm);

    expect(await readRun(paul, job.ingestRunId)).toMatchObject({ status: 'done', step: 'done' });
  });
});
