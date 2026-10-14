import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { factCandidates, facts, ingestRuns } from '@/server/db/schema/memory';
import { createFakeLlm } from '@/server/llm/fake-llm';
import type { LlmRequest } from '@/server/llm/llm';
import { adminDb } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';
import { readPromptJson } from '@/test/llm-prompt';
import { seedRightsScenario } from '@/test/rights-scenario';
import type { PlacementContext } from './context';
import { runPlacement } from './run-placement';

type CandidateInput = { name: string; predicate: string; typeHint: string };

const NOTE = (name: string): CandidateInput => ({ name, predicate: 'note', typeHint: 'client' });

// Run de l'acteur à l'étape `placement`, avec un candidat en attente par entrée.
async function seedPlacementRun(
  ctx: TenantContext,
  source: { sourceId: string; turnId: string },
  inputs: CandidateInput[],
  status: 'queued' | 'failed' = 'queued',
) {
  const acl = [ctx.userId];
  const [run] = await adminDb
    .insert(ingestRuns)
    .values({
      tenantId: ctx.tenantId,
      sourceId: source.sourceId,
      turnIds: [source.turnId],
      step: 'placement',
      status,
      acl,
    })
    .returning({ id: ingestRuns.id });
  if (!run) throw new Error('run de test non créé');
  await adminDb.insert(factCandidates).values(
    inputs.map((input) => ({
      tenantId: ctx.tenantId,
      ingestRunId: run.id,
      turnId: source.turnId,
      statement: `Un fait de test sur ${input.name}.`,
      predicate: input.predicate,
      typeHint: input.typeHint,
      mentions: { subject: { name: input.name, email: null, domain: null }, others: [] },
      quote: 'Tour de test.',
      quoteStart: 0,
      quoteEnd: 13,
      confidence: 0.8,
      sensitivity: 'shareable' as const,
      factAcl: [ctx.tenantId],
      acl,
    })),
  );
  return { ingestRunId: run.id, tenantId: ctx.tenantId, userId: ctx.userId };
}

async function setupPaul(inputs: CandidateInput[], status?: 'queued' | 'failed') {
  const { members } = await createTestTenant(['Paul Martin']);
  const [paul] = members as [TenantContext];
  const job = await seedPlacementRun(paul, await seedSource(paul), inputs, status);
  return { paul, job };
}

// Faux Opus : chaque candidat du contexte va sur une nouvelle fiche à son nom.
const placeAllAsNew = () =>
  createFakeLlm((request: LlmRequest<unknown>) => {
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

const readRun = async (runId: string) => {
  const [run] = await adminDb.select().from(ingestRuns).where(eq(ingestRuns.id, runId));
  return run;
};

const readCandidates = (runId: string) =>
  adminDb
    .select({ id: factCandidates.id, status: factCandidates.status })
    .from(factCandidates)
    .where(eq(factCandidates.ingestRunId, runId));

describe('runPlacement', () => {
  it('range les candidats et termine le run', async () => {
    const { job } = await setupPaul([NOTE('ACME')]);
    const llm = placeAllAsNew();

    expect(await runPlacement(job, llm)).toBeNull();

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]).toMatchObject({ step: 'placement', maxTokens: 16_000 });
    expect(await readRun(job.ingestRunId)).toMatchObject({ step: 'done', status: 'done' });
    const [candidate] = await readCandidates(job.ingestRunId);
    expect(candidate?.status).toBe('placed');
    const placed = await adminDb
      .select()
      .from(facts)
      .where(eq(facts.candidateId, candidate?.id ?? ''));
    expect(placed).toHaveLength(1);
  });

  it('reprend un run marqué failed à l étape placement', async () => {
    const { job } = await setupPaul([NOTE('ACME')], 'failed');

    await runPlacement(job, placeAllAsNew());

    expect(await readRun(job.ingestRunId)).toMatchObject({ step: 'done', status: 'done' });
  });

  it('ne rappelle pas le LLM pour un run déjà rangé', async () => {
    const { job } = await setupPaul([NOTE('ACME')]);
    await runPlacement(job, placeAllAsNew());
    const again = placeAllAsNew();

    expect(await runPlacement(job, again)).toBeNull();

    expect(again.calls).toHaveLength(0);
  });

  it('découpe plus de 20 candidats en plusieurs appels', async () => {
    const inputs = Array.from({ length: 21 }, (_, n) => NOTE(`Client ${n + 1}`));
    const { job } = await setupPaul(inputs);
    const llm = placeAllAsNew();

    await runPlacement(job, llm);

    expect(llm.calls).toHaveLength(2);
    const candidates = await readCandidates(job.ingestRunId);
    expect(candidates.map((c) => c.status)).toEqual(Array(21).fill('placed'));
  });

  it('n envoie jamais au modèle ce que Marie ne voit pas (Orion, zanzibar)', async () => {
    const s = await seedRightsScenario();
    // « Oryon » ressemble assez à « Orion » pour que la fiche soit proposée à qui la voit.
    const inputs = [{ name: 'Oryon', predicate: 'echeance', typeHint: 'projet' }, NOTE('ACME')];
    const marieJob = await seedPlacementRun(
      s.marie,
      { sourceId: s.ids.marieSource, turnId: s.ids.marieTurn },
      inputs,
    );
    const paulJob = await seedPlacementRun(
      s.paul,
      { sourceId: s.ids.paulSource, turnId: s.ids.paulTurn },
      inputs,
    );
    const marieLlm = placeAllAsNew();
    const paulLlm = placeAllAsNew();

    await runPlacement(marieJob, marieLlm);
    await runPlacement(paulJob, paulLlm);

    // Le prompt système cite « Projet Orion » en exemple de titre : seul le contexte compte ici.
    const marieSent = marieLlm.calls.map((call) => call.prompt).join('\n');
    expect(marieSent).not.toContain('Orion');
    expect(marieSent).not.toContain('zanzibar');
    expect(paulLlm.calls[0]?.prompt).toContain('Orion');
  });
});
