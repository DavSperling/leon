import Anthropic, { AnthropicError, APIError } from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { type Llm, LlmError, type LlmRequest, type LlmStep, type LlmUsage } from './llm';
import { logLlmUsage } from './log-usage';

// Rangement sur Haiku 5.5 (14/10) : sur 24 décisions réelles, Haiku 5.5 a choisi la même fiche et la
// même relation qu'Opus 5.5 en effort high, pour 0,009 $ au lieu de 0,298 $. L'extraction reste sur
// Sonnet : Haiku y invente une citation sur trois, que la vérification rejette.
export const MODEL_BY_STEP = {
  triage: 'claude-haiku-5-5',
  extraction: 'claude-sonnet-5-5',
  placement: 'claude-haiku-5-5',
  juge: 'claude-haiku-5-5', // notation du jeu d'essai (src/essai/judge.ts)
} as const;

// L'effort est fixé à chaque étape (son défaut varie selon le modèle).
export const EFFORT_BY_STEP = {
  triage: 'low',
  extraction: 'medium',
  placement: 'medium',
  juge: 'low',
} as const;

export type AnthropicLike = Pick<Anthropic, 'beta'>;

// Repli serveur des refus (D12) : Sonnet et Opus seulement, Haiku n'en a pas.
const hasRefusalFallback = (model: string) => !model.startsWith('claude-haiku');
const REFUSAL_FALLBACK = {
  betas: ['server-side-fallback-2026-07-01'],
  fallbacks: 'default' as const,
};

const TRUNCATED_STOP_REASONS = ['max_tokens', 'model_context_window_exceeded'];

// Tarifs en dollars par million de tokens, recopiés de la référence docs/etudes/couts-2026-10/annexes/01-prix-llm.md
// (page officielle des tarifs, revérifiée le 14/10/2026) : on met l'annexe à jour d'abord, puis cette table.
// Prompts de moins de 100 000 tokens pour Haiku 5.5. Ils servent à estimer le coût de chaque appel.
const PRICE_PER_MTOK: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

// Un modèle sans tarif aurait un coût inconnu (null) dans llm_usage : config.ts le refuse au démarrage.
export const hasAnthropicPrice = (model: string) => model in PRICE_PER_MTOK;

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

// Compteurs et coût estimé d'un appel, sans arrondi : la somme de centaines d'appels doit rester juste.
export function usageOf(step: LlmStep, model: string, usage: Usage): LlmUsage {
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
  return {
    step,
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens,
    cacheWriteTokens,
    costUsd,
  };
}

// Journalise les compteurs de tokens et le coût estimé d'un appel, jamais son contenu.
export function logUsage(step: LlmStep, model: string, usage: Usage | undefined): LlmUsage | null {
  if (!usage) return null;
  const line = usageOf(step, model, usage);
  logLlmUsage(line);
  return line;
}

// models remplace le modèle de certaines étapes (voir config.ts) ; l'effort de l'étape reste le même.
export function createAnthropicLlm(
  options: ({ apiKey: string } | { client: AnthropicLike }) & {
    models?: Partial<Record<LlmStep, string>>;
  },
): Llm {
  const client: AnthropicLike =
    'client' in options ? options.client : new Anthropic({ apiKey: options.apiKey });
  const modelOf = (step: LlmStep) => options.models?.[step] ?? MODEL_BY_STEP[step];

  return {
    async generateObject<T>(request: LlmRequest<T>): Promise<T> {
      const model = modelOf(request.step);
      const message = await parseOrThrow(client, model, request);
      const usage = logUsage(request.step, message.model ?? model, message.usage);
      // Un appel dont le SDK n'a pas pu analyser la réponse est facturé mais n'est pas compté : le SDK ne rend pas son usage.
      // onUsage ne doit jamais lever ici : l'appel est déjà payé, le faire échouer le ferait payer deux fois par pg-boss.
      if (usage && request.onUsage) await request.onUsage(usage).catch(() => {});
      if (message.stop_reason === 'refusal') throw new LlmError('refus du modèle');
      if (message.stop_reason && TRUNCATED_STOP_REASONS.includes(message.stop_reason))
        throw new LlmError('réponse tronquée');
      if (message.parsed_output === null || message.parsed_output === undefined)
        throw new LlmError('sortie non conforme');
      return message.parsed_output;
    },
  };
}

async function parseOrThrow<T>(client: AnthropicLike, model: string, request: LlmRequest<T>) {
  const step: LlmStep = request.step;
  try {
    return await client.beta.messages.parse({
      model,
      max_tokens: request.maxTokens,
      // Consignes identiques d'un appel à l'autre (catalogue compris) : en cache, relues à 0,05x.
      system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: request.prompt }],
      output_config: { format: betaZodOutputFormat(request.schema), effort: EFFORT_BY_STEP[step] },
      ...(hasRefusalFallback(model) ? REFUSAL_FALLBACK : {}),
    });
  } catch (error) {
    // Le SDK analyse la sortie pendant l'appel et son message la cite : on ne le garde pas.
    // Les APIError (réseau, 429, 5xx) passent telles quelles : pg-boss reprend l'étape.
    if (error instanceof AnthropicError && !(error instanceof APIError))
      throw new LlmError('sortie non conforme');
    throw error;
  }
}
