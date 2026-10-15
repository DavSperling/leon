import type { z } from 'zod';

// Étapes du pipeline, dont l'usage est enregistré dans llm_usage ; « juge » sert à la notation du jeu d'essai.
export const PIPELINE_LLM_STEPS = ['triage', 'extraction', 'placement'] as const;
export type PipelineLlmStep = (typeof PIPELINE_LLM_STEPS)[number];
export type LlmStep = PipelineLlmStep | 'juge';

// Compteurs et coût estimé d'un appel, jamais son contenu.
export type LlmUsage = {
  step: LlmStep;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number | null;
};

export type LlmRequest<T> = {
  step: LlmStep;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  // Appelé après chaque appel facturé ; ne doit jamais lever (voir record-usage.ts).
  onUsage?: (usage: LlmUsage) => Promise<void>;
};

// Le client réel (anthropic-llm.ts) et le faux des tests sont les deux implémentations.
export interface Llm {
  generateObject<T>(request: LlmRequest<T>): Promise<T>;
}

// Message fixe : jamais celui du SDK, qui peut citer la sortie du modèle.
export class LlmError extends Error {
  override name = 'LlmError';
}
