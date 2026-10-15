import { z } from 'zod';
import { type Llm, LlmError, type LlmRequest, type LlmStep, type LlmUsage } from './llm';
import { logLlmUsage } from './log-usage';

// OpenRouter sert les modèles d'Anthropic, d'OpenAI et de Mistral derrière une seule API (format
// OpenAI) : c'est par là qu'on compare des modèles sur le pipeline (voir config.ts).
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Statuts que pg-boss doit reprendre : délai, surcharge et pannes passagères.
const isRetryable = (status: number) => status === 408 || status === 429 || status >= 500;

// Au-delà, l'appel est abandonné et repris par pg-boss : une extraction longue reste bien en deçà.
const TIMEOUT_MS = 600_000;

// JSON Schema de la sortie, au format du mode strict (OpenAI) : zod ferme déjà chaque objet et rend
// obligatoires ses champs non facultatifs ; un nullable devient type [x, "null"] ou anyOf. Seul
// « $schema » est retiré, que le mode strict ne connaît pas. Les quatre schémas de sortie (triage,
// extraction, rangement, juge) passent tels quels : voir openrouter-llm.test.ts.
export function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _, ...json } = z.toJSONSchema(schema) as Record<string, unknown>;
  return json;
}

const UsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  prompt_tokens_details: z
    .object({
      cached_tokens: z.number().nullish(),
      cache_write_tokens: z.number().nullish(),
    })
    .nullish(),
  cost: z.number().nullish(), // coût facturé par OpenRouter, en dollars
  // Avec une clé propre (BYOK), cost n'est que la commission d'OpenRouter : l'inférence est facturée
  // à part par le fournisseur, et rendue ici.
  is_byok: z.boolean().nullish(),
  cost_details: z.object({ upstream_inference_cost: z.number().nullish() }).nullish(),
});
type OpenRouterUsage = z.infer<typeof UsageSchema>;

// Lu à part, avant le reste : un appel facturé est compté même quand la réponse est une erreur ou
// qu'elle est mal formée.
const UsageEnvelopeSchema = z.object({
  model: z.string().optional(),
  provider: z.string().optional(), // fournisseur qui a servi l'appel (Mistral, Azure, Together…)
  usage: UsageSchema,
});

const ResponseSchema = z.object({
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
  error: z.object({ code: z.union([z.number(), z.string()]).optional() }).optional(),
});

// Le coût est celui qu'OpenRouter facture (usage.cost, plus le coût amont en BYOK), pas une
// estimation : aucune table de tarifs à tenir pour chaque modèle comparé. Les tokens lus ou écrits en
// cache sont comptés à part, comme chez Anthropic : inputTokens ne compte que l'entrée hors cache.
// Le modèle est noté « modèle@fournisseur » : le même modèle ne coûte ni ne répond pareil partout.
export function openRouterUsageOf(step: LlmStep, model: string, usage: OpenRouterUsage): LlmUsage {
  const cacheReadTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const cacheWriteTokens = usage.prompt_tokens_details?.cache_write_tokens ?? 0;
  const upstream = usage.is_byok ? (usage.cost_details?.upstream_inference_cost ?? 0) : 0;
  return {
    step,
    model,
    inputTokens: Math.max(0, usage.prompt_tokens - cacheReadTokens - cacheWriteTokens),
    outputTokens: usage.completion_tokens,
    cacheReadTokens,
    cacheWriteTokens,
    costUsd: usage.cost === null || usage.cost === undefined ? null : usage.cost + upstream,
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
      const raw = await post(doFetch, options.apiKey, {
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
        // Seuls les fournisseurs qui acceptent la sortie structurée reçoivent la requête ; OpenRouter
        // choisit librement parmi eux (pas d'épinglage), le fournisseur servi est noté avec l'usage.
        provider: { require_parameters: true, allow_fallbacks: true },
      });

      const envelope = UsageEnvelopeSchema.safeParse(raw);
      if (envelope.success) {
        const { provider, usage: rawUsage } = envelope.data;
        const served = envelope.data.model ?? model;
        const usage = openRouterUsageOf(
          request.step,
          provider ? `${served}@${provider}` : served,
          rawUsage,
        );
        logLlmUsage(usage);
        // onUsage ne doit jamais lever ici : l'appel est déjà payé, le faire échouer le ferait payer deux fois par pg-boss.
        if (request.onUsage) await request.onUsage(usage).catch(() => {});
      }

      const parsedBody = ResponseSchema.safeParse(raw);
      if (!parsedBody.success) throw new Error('OpenRouter : réponse illisible');
      const body = parsedBody.data;
      // OpenRouter peut rendre une erreur du fournisseur dans un corps 200.
      if (body.error) {
        const code = Number(body.error.code);
        throw httpError(Number.isInteger(code) ? code : 502);
      }

      const choice = body.choices?.[0];
      // Panne du fournisseur en cours de génération : passagère, pg-boss reprend.
      if (choice?.finish_reason === 'error') throw new Error('OpenRouter : erreur du fournisseur');
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
): Promise<unknown> {
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
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError')
      throw new Error('OpenRouter : délai dépassé');
    throw new Error('OpenRouter : erreur réseau');
  }
  if (!response.ok) throw httpError(response.status);
  try {
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError')
      throw new Error('OpenRouter : délai dépassé');
    throw new Error('OpenRouter : réponse illisible');
  }
}
