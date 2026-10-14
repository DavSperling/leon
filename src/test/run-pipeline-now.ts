import type { Llm } from '@/server/llm/llm';
import type { PipelineJob, PipelineStep } from '@/server/pipeline/queue';
import { runPipelineStep } from '@/server/pipeline/worker';

// Enchaîne les étapes du pipeline sans pg-boss (tests).
export async function runPipelineNow(job: PipelineJob, llm: Llm): Promise<void> {
  let step: PipelineStep | null = 'triage';
  while (step) step = await runPipelineStep(step, job, llm);
}
