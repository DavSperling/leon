import type { Env } from '@/server/env';
import {
  type AnthropicLike,
  createAnthropicLlm,
  EFFORT_BY_STEP,
  hasAnthropicPrice,
  MODEL_BY_STEP,
} from './anthropic-llm';
import type { Llm, LlmRequest, LlmStep, PipelineLlmStep } from './llm';
import { createOpenRouterLlm, type ReasoningEffort } from './openrouter-llm';
import { fetchOpenRouterCatalog, type OpenRouterCatalog } from './openrouter-models';

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

// Effort de raisonnement des étapes sur OpenRouter dont le modèle le règle, d'après le catalogue :
// le même que chez Anthropic (EFFORT_BY_STEP). Sans catalogue, aucun.
function openRouterEfforts(
  choices: Record<PipelineLlmStep, LlmChoice>,
  catalog: OpenRouterCatalog | null | undefined,
): Partial<Record<LlmStep, ReasoningEffort>> {
  return Object.fromEntries(
    STEPS.filter(
      (step) =>
        choices[step].provider === 'openrouter' && catalog?.get(choices[step].model)?.reasoning,
    ).map((step) => [step, EFFORT_BY_STEP[step]]),
  );
}

// « fournisseur:modèle » de chaque étape, avec l'effort envoyé à OpenRouter s'il y en a un, jamais de
// clé : exposé par /api/version au jeu d'essai.
export type LlmConfigDescription = Record<PipelineLlmStep, string>;

export function describeLlmConfig(
  env: LlmEnv,
  catalog?: OpenRouterCatalog | null,
): LlmConfigDescription {
  const choices = llmChoices(env);
  const efforts = openRouterEfforts(choices, catalog);
  return Object.fromEntries(
    STEPS.map((step) => {
      const { provider, model } = choices[step];
      const effort = efforts[step];
      return [step, `${provider}:${model}${effort ? ` (effort ${effort})` : ''}`];
    }),
  ) as LlmConfigDescription;
}

// Noms des clés manquantes pour les fournisseurs configurés (jamais leurs valeurs).
export function missingLlmKeys(env: LlmEnv): string[] {
  const providers = new Set(Object.values(llmChoices(env)).map((c) => c.provider));
  return [...providers].map((p) => KEY_BY_PROVIDER[p]).filter((key) => !env[key]);
}

// Ce qui empêche de démarrer le pipeline, sans jamais une valeur de clé : clé absente d'un fournisseur
// configuré, ou modèle Anthropic sans tarif (son coût serait inconnu dans llm_usage).
export function llmConfigProblems(env: LlmEnv): string[] {
  const choices = llmChoices(env);
  const unpriced = STEPS.map((step) => choices[step])
    .filter((c) => c.provider === 'anthropic' && !hasAnthropicPrice(c.model))
    .map((c) => `modèle Anthropic sans tarif (coût inconnu) : ${c.model}`);
  return [...missingLlmKeys(env).map((key) => `${key} absente`), ...new Set(unpriced)];
}

function modelsOf(choices: Record<PipelineLlmStep, LlmChoice>, provider: LlmProvider) {
  return Object.fromEntries(
    STEPS.filter((step) => choices[step].provider === provider).map((step) => [
      step,
      choices[step].model,
    ]),
  ) as Partial<Record<LlmStep, string>>;
}

// Un client qui envoie chaque requête au fournisseur de son étape. Lève, sans jamais une valeur de
// clé, si la configuration ne permet pas de démarrer, ou si un modèle OpenRouter manque au catalogue
// (fail closed : un identifiant mal recopié ne doit pas faire échouer chaque run). deps sert aux tests.
export function createConfiguredLlm(
  env: LlmEnv,
  deps: {
    anthropic?: AnthropicLike;
    fetch?: typeof fetch;
    catalog?: OpenRouterCatalog | null;
  } = {},
): Llm {
  const problems = llmConfigProblems(env);
  if (problems.length > 0) throw new Error(`Configuration des modèles : ${problems.join(' ; ')}.`);
  const choices = llmChoices(env);
  const { catalog } = deps;
  const unlisted = STEPS.map((step) => choices[step])
    .filter((c) => c.provider === 'openrouter' && catalog && !catalog.has(c.model))
    .map((c) => c.model);
  if (unlisted.length > 0)
    throw new Error(
      `Configuration des modèles : absent(s) du catalogue OpenRouter : ${[...new Set(unlisted)].join(', ')}.`,
    );

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
        efforts: openRouterEfforts(choices, catalog),
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

// Au démarrage du serveur : lit une fois le catalogue public d'OpenRouter si une étape y passe, puis
// crée le client et sa description. Catalogue injoignable : on prévient et on n'envoie aucun réglage
// de raisonnement (jamais un paramètre qu'un modèle pourrait refuser).
export async function startConfiguredLlm(
  env: LlmEnv,
  deps: { anthropic?: AnthropicLike; fetch?: typeof fetch } = {},
): Promise<{ llm: Llm; description: LlmConfigDescription }> {
  const usesOpenRouter = Object.values(llmChoices(env)).some((c) => c.provider === 'openrouter');
  let catalog: OpenRouterCatalog | null = null;
  if (usesOpenRouter) {
    catalog = await fetchOpenRouterCatalog(deps.fetch ?? fetch);
    if (!catalog)
      console.warn(
        '[leon] Catalogue OpenRouter injoignable : aucun effort de raisonnement ne sera envoyé.',
      );
  }
  return {
    llm: createConfiguredLlm(env, { ...deps, catalog }),
    description: describeLlmConfig(env, catalog),
  };
}
