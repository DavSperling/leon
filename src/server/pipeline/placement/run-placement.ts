import { and, asc, eq } from 'drizzle-orm';
import { resolveTenantContext } from '@/server/auth/tenant-context';
import { factCandidates } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import type { Llm } from '@/server/llm/llm';
import {
  buildPlacementPrompt,
  PLACEMENT_BATCH_MAX,
  PlacementOutputSchema,
} from '../prompts/placement';
import type { PipelineJob } from '../queue';
import { advanceRun, startStep } from '../runs';
import { applyPlacement } from './apply';
import { buildPlacementContext, type PlacementContext } from './context';
import { type PlacementAction, planPlacement } from './plan';

const PLACEMENT_MAX_TOKENS = 16_000;

// Un appel au modèle par lot de candidats ; chaque lot garde le catalogue entier.
async function planInBatches(context: PlacementContext, llm: Llm): Promise<PlacementAction[]> {
  const actions: PlacementAction[] = [];
  for (let start = 0; start < context.candidates.length; start += PLACEMENT_BATCH_MAX) {
    const batch = {
      catalog: context.catalog,
      candidates: context.candidates.slice(start, start + PLACEMENT_BATCH_MAX),
    };
    const output = await llm.generateObject({
      step: 'placement',
      ...buildPlacementPrompt(batch),
      schema: PlacementOutputSchema,
      maxTokens: PLACEMENT_MAX_TOKENS,
    });
    actions.push(...planPlacement(batch, output));
  }
  return actions;
}

export async function runPlacement(job: PipelineJob, llm: Llm): Promise<null> {
  const ctx = await resolveTenantContext(job.userId, job.tenantId);
  if (!ctx) throw new Error('contexte du job introuvable');
  const run = await startStep(ctx, job.ingestRunId, 'placement');
  if (!run) return null;
  const { candidates, context } = await withTenant(ctx, async (tx) => {
    const rows = await tx
      .select()
      .from(factCandidates)
      .where(and(eq(factCandidates.ingestRunId, run.id), eq(factCandidates.status, 'pending')))
      .orderBy(asc(factCandidates.createdAt), asc(factCandidates.id));
    return { candidates: rows, context: await buildPlacementContext(tx, rows) };
  });
  const actions = await planInBatches(context, llm); // appels LLM hors transaction
  await withTenant(ctx, async (tx) => {
    await applyPlacement(tx, ctx, context, candidates, actions);
    await advanceRun(tx, run.id, 'done');
  });
  return null;
}
