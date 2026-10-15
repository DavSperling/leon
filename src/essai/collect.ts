import { eq, max, sql } from 'drizzle-orm';
import { cards, cardTypes, facts, ingestRuns, sources, turns } from '@/server/db/schema/memory';
import { llmUsage } from '@/server/db/schema/usage';
import { PIPELINE_LLM_STEPS, type PipelineLlmStep } from '@/server/llm/llm';
import type { AdminDb } from './admin-db';

export type FaitProduit = {
  id: string;
  sourceExternalId: string;
  turnExternalId: string;
  statement: string;
  value: string | null;
  quote: string;
  status: string;
  sensitivity: string;
  partage: boolean; // l'ACL contient l'organisation : visible de toute l'équipe
  ficheId: string;
  ficheTitre: string;
  typeFiche: string;
  supersededBy: string | null;
};

export async function lireFaits(db: AdminDb, tenantId: string): Promise<FaitProduit[]> {
  return (
    db
      .select({
        id: facts.id,
        sourceExternalId: sources.externalId,
        turnExternalId: turns.externalId,
        statement: facts.statement,
        value: facts.value,
        quote: facts.quote,
        status: facts.status,
        sensitivity: facts.sensitivity,
        partage: sql<boolean>`${facts.acl} @> array[${facts.tenantId}]`,
        ficheId: cards.id,
        ficheTitre: cards.title,
        typeFiche: cardTypes.slug,
        supersededBy: facts.supersededBy,
      })
      .from(facts)
      .innerJoin(sources, eq(sources.id, facts.sourceId))
      .innerJoin(turns, eq(turns.id, facts.turnId))
      .innerJoin(cards, eq(cards.id, facts.cardId))
      .innerJoin(cardTypes, eq(cardTypes.id, cards.typeId))
      .where(eq(facts.tenantId, tenantId))
      // Même horodatage possible pour deux faits insérés dans le même lot : l'id départage un ordre stable.
      .orderBy(facts.recordedAt, facts.id)
  );
}

export type UsageEtape = {
  appels: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  coutsManquants: number; // appels au coût inconnu (cost_usd null) : le coût de l'étape est sous-estimé
  costUsd: number;
};
export type UsageParEtape = Record<PipelineLlmStep, UsageEtape>;

const zero = (): UsageEtape => ({
  appels: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  coutsManquants: 0,
  costUsd: 0,
});

export async function lireUsage(db: AdminDb, tenantId: string): Promise<UsageParEtape> {
  const rows = await db
    .select({
      step: llmUsage.step,
      appels: sql<number>`count(*)::int`,
      inputTokens: sql<number>`sum(${llmUsage.inputTokens})::int`,
      outputTokens: sql<number>`sum(${llmUsage.outputTokens})::int`,
      cacheReadTokens: sql<number>`sum(${llmUsage.cacheReadTokens})::int`,
      cacheWriteTokens: sql<number>`sum(${llmUsage.cacheWriteTokens})::int`,
      coutsManquants: sql<number>`count(*) filter (where ${llmUsage.costUsd} is null)::int`,
      costUsd: sql<string>`coalesce(sum(${llmUsage.costUsd}), 0)`,
    })
    .from(llmUsage)
    .where(eq(llmUsage.tenantId, tenantId))
    .groupBy(llmUsage.step);
  const usage = Object.fromEntries(
    PIPELINE_LLM_STEPS.map((step) => [step, zero()]),
  ) as UsageParEtape;
  for (const { step, costUsd, ...rest } of rows)
    usage[step] = { ...rest, costUsd: Number(costUsd) };
  return usage;
}

// Modèles réellement appelés à chaque étape (llm_usage.model, tel que rendu par l'API) : vérifie que
// le passage a tourné sur les modèles que le serveur annonçait.
export type ModelesParEtape = Record<PipelineLlmStep, string[]>;

export async function lireModeles(db: AdminDb, tenantId: string): Promise<ModelesParEtape> {
  const rows = await db
    .selectDistinct({ step: llmUsage.step, model: llmUsage.model })
    .from(llmUsage)
    .where(eq(llmUsage.tenantId, tenantId))
    .orderBy(llmUsage.step, llmUsage.model);
  const modeles = Object.fromEntries(
    PIPELINE_LLM_STEPS.map((step) => [step, [] as string[]]),
  ) as ModelesParEtape;
  for (const { step, model } of rows) modeles[step].push(model);
  return modeles;
}

export async function etatRuns(db: AdminDb, tenantId: string) {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${ingestRuns.status} = 'done')::int`,
      failed: sql<number>`count(*) filter (where ${ingestRuns.status} = 'failed')::int`,
      enCours: sql<number>`count(*) filter (where ${ingestRuns.status} in ('queued', 'running'))::int`,
      fin: max(ingestRuns.updatedAt),
    })
    .from(ingestRuns)
    .where(eq(ingestRuns.tenantId, tenantId));
  return row ?? { total: 0, done: 0, failed: 0, enCours: 0, fin: null };
}
