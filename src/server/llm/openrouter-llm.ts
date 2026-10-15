import { z } from 'zod';
import { type Llm, LlmError, type LlmRequest, type LlmStep, type LlmUsage } from './llm';
import { logLlmUsage } from './log-usage';

// OpenRouter sert les modèles d'Anthropic, d'OpenAI et de Mistral derrière une seule API (format
// OpenAI) : c'est par là qu'on compare des modèles sur le pipeline (voir config.ts).
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Statuts que pg-boss doit reprendre : surcharge et pannes passagères.
const isRetryable = (status: number) => status === 429 || status >= 500;

// JSON Schema de la sortie, au format du mode strict (OpenAI) : zod ferme déjà chaque objet et rend
// obligatoires ses champs non facultatifs ; un nullable devient type [x, "null"] ou anyOf. Seul
// « $schema » est retiré, que le mode strict ne connaît pas. Les quatre schémas de sortie (triage,
// extraction, rangement, juge) passent tels quels : voir openrouter-llm.test.ts.
export function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _, ...json } = z.toJSONSchema(schema) as Record<string, unknown>;
  return json;
}

const ResponseSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        message: z
          .object({ content: z.string().nullish(), refusal: z.string().nullish() })
          .optional(),
      }),
    )
    .optional(),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      prompt_tokens_details: z
        .object({
          cached_tokens: z.number().nullish(),
          cache_write_tokens: z.number().nullish(),
        })
        .nullish(),
      cost: z.number().nullish(), // coût facturé par OpenRouter, en dollars
    })
    .nullish(),
  error: z.object({ code: z.union([z.number(), z.string()]).optional() }).optional(),
});
type OpenRouterResponse = z.infer<typeof ResponseSchema>;

// Le coût est celui qu'OpenRouter facture (usage.cost), pas une estimation : aucune table de tarifs à
// tenir pour chaque modèle comparé. Les tokens lus ou écrits en cache sont comptés à part, comme chez
// Anthropic : inputTokens ne compte que l'entrée hors cache.
export function openRouterUsageOf(
  step: LlmStep,
  model: string,
  usage: NonNullable<OpenRouterResponse['usage']>,
): LlmUsage {
  const cacheReadTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const cacheWriteTokens = usage.prompt_tokens_details?.cache_write_tokens ?? 0;
  return {
    step,
    model,
    inputTokens: Math.max(0, usage.prompt_tokens - cacheReadTokens - cacheWriteTokens),
    outputTokens: usage.completion_tokens,
    cacheReadTokens,
    cacheWriteTokens,
    costUsd: usage.cost ?? null,
  };
}

// Messages d'erreur fixes : ni le prompt, ni la sortie, ni le corps de la réponse d'OpenRouter, qui
// peut citer l'un ou l'autre. Une erreur ordinaire est reprise par pg-boss, une LlmError aussi mais
// signale un problème qui ne passera pas tout seul (requête refusée, clé, crédit, modèle inconnu).
function httpError(status: number): Error {
  const message = `OpenRouter : HTTP ${status}`;
  return isRetryable(status) ? new Error(message) : new LlmError(message);
}

export function createOpenRouterLlm(options: {
  apiKey: string;
  models: Partial<Record<LlmStep, string>>;
  fetch?: typeof fetch;
}): Llm {
  const doFetch = options.fetch ?? fetch;

  return {
    async generateObject<T>(request: LlmRequest<T>): Promise<T> {
      const model = options.models[request.step];
      if (!model)
        throw new Error(`Aucun modèle OpenRouter configuré pour l'étape ${request.step}.`);
      const body = await post(doFetch, options.apiKey, {
        model,
        max_tokens: request.maxTokens,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.prompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'sortie', strict: true, schema: strictJsonSchema(request.schema) },
        },
        usage: { include: true },
        // Seuls les fournisseurs qui acceptent la sortie structurée reçoivent la requête.
        provider: { require_parameters: true },
      });

      if (body.usage) {
        const usage = openRouterUsageOf(request.step, body.model ?? model, body.usage);
        logLlmUsage(usage);
        // onUsage ne doit jamais lever ici : l'appel est déjà payé, le faire échouer le ferait payer deux fois par pg-boss.
        if (request.onUsage) await request.onUsage(usage).catch(() => {});
      }

      const choice = body.choices?.[0];
      if (choice?.message?.refusal || choice?.finish_reason === 'content_filter')
        throw new LlmError('refus du modèle');
      if (choice?.finish_reason === 'length') throw new LlmError('réponse tronquée');
      const content = choice?.message?.content;
      if (typeof content !== 'string') throw new LlmError('sortie non conforme');
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new LlmError('sortie non conforme');
      }
      const result = request.schema.safeParse(parsed);
      if (!result.success) throw new LlmError('sortie non conforme');
      return result.data;
    },
  };
}

async function post(
  doFetch: typeof fetch,
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<OpenRouterResponse> {
  let response: Response;
  try {
    response = await doFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Leon',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('OpenRouter : erreur réseau');
  }
  if (!response.ok) throw httpError(response.status);
  let body: OpenRouterResponse;
  try {
    body = ResponseSchema.parse(await response.json());
  } catch {
    throw new Error('OpenRouter : réponse illisible');
  }
  // OpenRouter peut rendre une erreur du fournisseur dans un corps 200.
  if (body.error) {
    const code = Number(body.error.code);
    throw httpError(Number.isInteger(code) ? code : 502);
  }
  return body;
}
