import Anthropic, { AnthropicError, APIError } from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { type Llm, LlmError, type LlmRequest, type LlmStep } from './llm';

export const MODEL_BY_STEP = {
  triage: 'claude-haiku-5-5',
  extraction: 'claude-sonnet-5-5',
  placement: 'claude-opus-5-5',
} as const;

// Opus 5.5 réfléchit toujours (pensée adaptative) et son effort par défaut est `medium` : on le fixe.
export const EFFORT_BY_STEP = { triage: 'low', extraction: 'medium', placement: 'high' } as const;

export type AnthropicLike = Pick<Anthropic, 'beta'>;

// Repli serveur des refus (D12) : Sonnet et Opus seulement, Haiku n'en a pas.
const REFUSAL_FALLBACK = {
  betas: ['server-side-fallback-2026-07-01'],
  fallbacks: 'default' as const,
};

const TRUNCATED_STOP_REASONS = ['max_tokens', 'model_context_window_exceeded'];

export function createAnthropicLlm(options: { apiKey: string } | { client: AnthropicLike }): Llm {
  const client: AnthropicLike =
    'client' in options ? options.client : new Anthropic({ apiKey: options.apiKey });

  return {
    async generateObject<T>(request: LlmRequest<T>): Promise<T> {
      const message = await parseOrThrow(client, request);
      if (message.stop_reason === 'refusal') throw new LlmError('refus du modèle');
      if (message.stop_reason && TRUNCATED_STOP_REASONS.includes(message.stop_reason))
        throw new LlmError('réponse tronquée');
      if (message.parsed_output === null || message.parsed_output === undefined)
        throw new LlmError('sortie non conforme');
      return message.parsed_output;
    },
  };
}

async function parseOrThrow<T>(client: AnthropicLike, request: LlmRequest<T>) {
  const step: LlmStep = request.step;
  try {
    return await client.beta.messages.parse({
      model: MODEL_BY_STEP[step],
      max_tokens: request.maxTokens,
      system: request.system,
      messages: [{ role: 'user', content: request.prompt }],
      output_config: { format: betaZodOutputFormat(request.schema), effort: EFFORT_BY_STEP[step] },
      ...(step === 'triage' ? {} : REFUSAL_FALLBACK),
    });
  } catch (error) {
    // Le SDK analyse la sortie pendant l'appel et son message la cite : on ne le garde pas.
    // Les APIError (réseau, 429, 5xx) passent telles quelles : pg-boss reprend l'étape.
    if (error instanceof AnthropicError && !(error instanceof APIError))
      throw new LlmError('sortie non conforme');
    throw error;
  }
}
