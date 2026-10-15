import { resolveTenantContext } from '@/server/auth/tenant-context';
import { llmUsage } from '@/server/db/schema/usage';
import { withTenant } from '@/server/db/with-tenant';
import { logError } from '@/server/log';
import type { PipelineJob } from '@/server/pipeline/queue';
import {
  type Llm,
  type LlmRequest,
  type LlmUsage,
  PIPELINE_LLM_STEPS,
  type PipelineLlmStep,
} from './llm';

const isPipelineStep = (step: string): step is PipelineLlmStep =>
  (PIPELINE_LLM_STEPS as readonly string[]).includes(step);

// Enregistre l'usage d'un appel pour l'organisation et le run du job. Un échec est journalisé sans
// lever : l'appel est déjà payé, l'étape ne doit pas échouer pour une ligne de comptabilité.
export async function recordLlmUsage(job: PipelineJob, usage: LlmUsage): Promise<void> {
  const { step } = usage;
  if (!isPipelineStep(step)) return;
  try {
    const ctx = await resolveTenantContext(job.userId, job.tenantId);
    if (!ctx) return;
    await withTenant(ctx, (tx) =>
      tx.insert(llmUsage).values({
        tenantId: ctx.tenantId,
        ingestRunId: job.ingestRunId,
        step,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
        costUsd: usage.costUsd === null ? null : usage.costUsd.toFixed(8),
      }),
    );
  } catch (error) {
    logError('llm.usage_record_failed', error, { runId: job.ingestRunId });
  }
}

// Le client d'un job : chaque appel enregistre son usage, sans que le code des étapes le sache.
export function recordingUsage(llm: Llm, job: PipelineJob): Llm {
  return {
    generateObject<T>(request: LlmRequest<T>): Promise<T> {
      return llm.generateObject({ ...request, onUsage: (usage) => recordLlmUsage(job, usage) });
    },
  };
}
