import type { Env } from '@/server/env';
import { type AnthropicLike, createAnthropicLlm, MODEL_BY_STEP } from './anthropic-llm';
import type { Llm, LlmRequest, LlmStep, PipelineLlmStep } from './llm';
import { createOpenRouterLlm } from './openrouter-llm';

// Choix du modèle de chaque étape du pipeline, par variable d'environnement, pour comparer des
// modèles d'Anthropic, d'OpenAI et de Mistral (via OpenRouter) sans toucher au code. Le juge du jeu
// d'essai reste toujours sur Anthropic Haiku : la notation doit rester comparable d'un passage à l'autre.
export type LlmEnv = Partial<
  Pick<
    Env,
    | 'ANTHROPIC_API_KEY'
    | 'OPENROUTER_API_KEY'
    | 'LEON_LLM_TRIAGE'
    | 'LEON_LLM_EXTRACTION'
    | 'LEON_LLM_RANGEMENT'
  >
>;

export type LlmProvider = 'anthropic' | 'openrouter';
export type LlmChoice = { provider: LlmProvider; model: string };

// L'étape « placement » s'appelle « rangement » partout ailleurs (interface, historique des essais).
const ENV_BY_STEP = {
  triage: 'LEON_LLM_TRIAGE',
  extraction: 'LEON_LLM_EXTRACTION',
  placement: 'LEON_LLM_RANGEMENT',
} as const satisfies Record<PipelineLlmStep, keyof LlmEnv>;

const KEY_BY_PROVIDER = {
  anthropic: 'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
} as const satisfies Record<LlmProvider, keyof LlmEnv>;

const STEPS = Object.keys(ENV_BY_STEP) as PipelineLlmStep[];

// Le format est validé par env.ts : « anthropic:<modèle> » ou « openrouter:<fournisseur>/<modèle> ».
function parseChoice(step: PipelineLlmStep, value: string | undefined): LlmChoice {
  if (!value) return { provider: 'anthropic', model: MODEL_BY_STEP[step] };
  const separator = value.indexOf(':');
  return {
    provider: value.slice(0, separator) as LlmProvider,
    model: value.slice(separator + 1),
  };
}

export function llmChoices(env: LlmEnv): Record<PipelineLlmStep, LlmChoice> {
  return Object.fromEntries(
    STEPS.map((step) => [step, parseChoice(step, env[ENV_BY_STEP[step]])]),
  ) as Record<PipelineLlmStep, LlmChoice>;
}

// « fournisseur:modèle » de chaque étape, jamais de clé : exposé par /api/version au jeu d'essai.
export type LlmConfigDescription = Record<PipelineLlmStep, string>;

export function describeLlmConfig(env: LlmEnv): LlmConfigDescription {
  const choices = llmChoices(env);
  return Object.fromEntries(
    STEPS.map((step) => [step, `${choices[step].provider}:${choices[step].model}`]),
  ) as LlmConfigDescription;
}

// Noms des clés manquantes pour les fournisseurs configurés (jamais leurs valeurs).
export function missingLlmKeys(env: LlmEnv): string[] {
  const providers = new Set(Object.values(llmChoices(env)).map((c) => c.provider));
  return [...providers].map((p) => KEY_BY_PROVIDER[p]).filter((key) => !env[key]);
}

function modelsOf(choices: Record<PipelineLlmStep, LlmChoice>, provider: LlmProvider) {
  return Object.fromEntries(
    STEPS.filter((step) => choices[step].provider === provider).map((step) => [
      step,
      choices[step].model,
    ]),
  ) as Partial<Record<LlmStep, string>>;
}

// Un client qui envoie chaque requête au fournisseur de son étape. Lève au démarrage, avec le nom de
// la clé et jamais sa valeur, si un fournisseur configuré n'a pas de clé. deps sert aux tests.
export function createConfiguredLlm(
  env: LlmEnv,
  deps: { anthropic?: AnthropicLike; fetch?: typeof fetch } = {},
): Llm {
  const missing = missingLlmKeys(env);
  if (missing.length > 0)
    throw new Error(
      `Configuration des modèles : ${missing.join(', ')} manquante pour les étapes configurées.`,
    );
  const choices = llmChoices(env);

  // Le juge passe toujours par Anthropic, avec son modèle par défaut (pas de surcharge pour lui).
  const anthropicModels = modelsOf(choices, 'anthropic');
  const anthropic = deps.anthropic
    ? createAnthropicLlm({ client: deps.anthropic, models: anthropicModels })
    : env.ANTHROPIC_API_KEY
      ? createAnthropicLlm({ apiKey: env.ANTHROPIC_API_KEY, models: anthropicModels })
      : null;
  const openRouterModels = modelsOf(choices, 'openrouter');
  const openRouter = env.OPENROUTER_API_KEY
    ? createOpenRouterLlm({
        apiKey: env.OPENROUTER_API_KEY,
        models: openRouterModels,
        fetch: deps.fetch,
      })
    : null;

  return {
    generateObject<T>(request: LlmRequest<T>): Promise<T> {
      const provider = request.step === 'juge' ? 'anthropic' : choices[request.step].provider;
      const client = provider === 'anthropic' ? anthropic : openRouter;
      if (!client)
        return Promise.reject(
          new Error(`${KEY_BY_PROVIDER[provider]} manquante pour l'étape ${request.step}.`),
        );
      return client.generateObject(request);
    },
  };
}
