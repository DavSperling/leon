import type { z } from 'zod';

export type LlmStep = 'triage' | 'extraction' | 'placement';

export type LlmRequest<T> = {
  step: LlmStep;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens: number;
};

// Le client réel (anthropic-llm.ts) et le faux des tests sont les deux implémentations.
export interface Llm {
  generateObject<T>(request: LlmRequest<T>): Promise<T>;
}

// Message fixe : jamais celui du SDK, qui peut citer la sortie du modèle.
export class LlmError extends Error {
  override name = 'LlmError';
}
