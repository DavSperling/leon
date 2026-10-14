import Anthropic, { AnthropicError, APIError } from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { type Llm, LlmError, type LlmRequest, type LlmStep } from './llm';

// Rangement sur Haiku 5.5 (14/10) : sur 24 décisions réelles, Haiku 5.5 a choisi la même fiche et la
// même relation qu'Opus 5.5 en effort high, pour 0,009 $ au lieu de 0,298 $. L'extraction reste sur
// Sonnet : Haiku y invente une citation sur trois, que la vérification rejette.
export const MODEL_BY_STEP = {
  triage: 'claude-haiku-5-5',
  extraction: 'claude-sonnet-5-5',
  placement: 'claude-haiku-5-5',
} as const;

// L'effort est fixé à chaque étape (son défaut varie selon le modèle).
export const EFFORT_BY_STEP = { triage: 'low', extraction: 'medium', placement: 'medium' } as const;

export type AnthropicLike = Pick<Anthropic, 'beta'>;

// Repli serveur des refus (D12) : Sonnet et Opus seulement, Haiku n'en a pas.
const hasRefusalFallback = (model: string) => !model.startsWith('claude-haiku');
const REFUSAL_FALLBACK = {
  betas: ['server-side-fallback-2026-07-01'],
  fallbacks: 'default' as const,
};

const TRUNCATED_STOP_REASONS = ['max_tokens', 'model_context_window_exceeded'];

// Tarifs en dollars par million de tokens (platform.claude.com/docs/en/about-claude/pricing, 14/10/2026),
// prompts de moins de 100 000 tokens pour Haiku 5.5. Ils servent à estimer le coût de chaque appel.
const PRICE_PER_MTOK: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

// Journalise les compteurs de tokens et le coût estimé d'un appel, jamais son contenu.
export function logUsage(step: LlmStep, model: string, usage: Usage | undefined): void {
  if (!usage) return;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  const price = PRICE_PER_MTOK[model];
  const costUsd = price
    ? (usage.input_tokens * price.input +
        usage.output_tokens * price.output +
        cacheReadTokens * price.cacheRead +
        cacheWriteTokens * price.cacheWrite) /
      1_000_000
    : null;
  const line = {
    step,
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens,
    cacheWriteTokens,
    costUsd: costUsd === null ? null : Number(costUsd.toFixed(5)),
  };
  console.info('[leon]', 'llm.usage', JSON.stringify(line));
}

export function createAnthropicLlm(options: { apiKey: string } | { client: AnthropicLike }): Llm {
  const client: AnthropicLike =
    'client' in options ? options.client : new Anthropic({ apiKey: options.apiKey });

  return {
    async generateObject<T>(request: LlmRequest<T>): Promise<T> {
      const message = await parseOrThrow(client, request);
      logUsage(request.step, message.model ?? MODEL_BY_STEP[request.step], message.usage);
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
      // Consignes identiques d'un appel à l'autre (catalogue compris) : en cache, relues à 0,05x.
      system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: request.prompt }],
      output_config: { format: betaZodOutputFormat(request.schema), effort: EFFORT_BY_STEP[step] },
      ...(hasRefusalFallback(MODEL_BY_STEP[step]) ? REFUSAL_FALLBACK : {}),
    });
  } catch (error) {
    // Le SDK analyse la sortie pendant l'appel et son message la cite : on ne le garde pas.
    // Les APIError (réseau, 429, 5xx) passent telles quelles : pg-boss reprend l'étape.
    if (error instanceof AnthropicError && !(error instanceof APIError))
      throw new LlmError('sortie non conforme');
    throw error;
  }
}
