import type { Env } from '../env';
import { createAnthropicLlm } from './anthropic-llm';
import { createDemoLlm } from './fake-llm';
import { type Llm, LlmError, type LlmStep } from './llm';
import { modelForStep, SUPPORTED_MODELS } from './models';
import { createOpenRouterLlm } from './openrouter-llm';

// Sans clé Anthropic : null, Leon garde et indexe tout mais ne répond pas (la recherche par le texte marche).
// LEON_LLM=factice rend le faux modèle des démonstrations, avant même de regarder la clé : une démo ne dépense
// rien. En production, env.ts refuse déjà de démarrer avec ce réglage.
// Avec la clé OpenRouter en plus, chaque appel part chez le fournisseur du modèle de son étape (models.ts). Sans
// elle, aucune étape n'a de modèle OpenRouter (models.ts et env.ts y veillent) : le client Anthropic seul.
export function getLlm(env: Env): Llm | null {
  if (env.LEON_LLM === 'factice') return createDemoLlm();
  if (env.ANTHROPIC_API_KEY === undefined) return null;
  // Sans la clé OpenRouter dans son environnement, le client Anthropic prend le modèle Anthropic de chaque étape
  // (models.ts) : le sien, ou le repli d'une étape servie par OpenRouter.
  const anthropic = createAnthropicLlm({
    apiKey: env.ANTHROPIC_API_KEY,
    env: { ...env, OPENROUTER_API_KEY: undefined },
  });
  if (env.OPENROUTER_API_KEY === undefined) return anthropic;
  const openrouter = createOpenRouterLlm({ apiKey: env.OPENROUTER_API_KEY, env });
  const viaOpenRouter = (step: LlmStep) =>
    SUPPORTED_MODELS[modelForStep(step, env)].provider === 'openrouter';
  return {
    streamText: (request) =>
      viaOpenRouter(request.step)
        ? orAnthropic(
            openrouter.streamText(request),
            () => anthropic.streamText(request),
            request.signal,
          )
        : anthropic.streamText(request),
    runAgent: (request) =>
      viaOpenRouter(request.step)
        ? orAnthropic(
            openrouter.runAgent(request),
            () => anthropic.runAgent(request),
            request.signal,
          )
        : anthropic.runAgent(request),
  };
}

// Un appel OpenRouter qui échoue avant d'avoir rien rendu (panne, plus d'hôte conforme, modèle retiré, refus) est
// refait chez Anthropic, sur le modèle Anthropic de l'étape : la personne a quand même sa réponse, et le journal
// garde l'échec (llm.appel). Après un premier morceau, l'erreur passe telle quelle : on ne recolle pas deux réponses.
export async function* orAnthropic<T>(
  first: AsyncIterable<T>,
  fallback: () => AsyncIterable<T>,
  signal: AbortSignal | undefined,
): AsyncGenerator<T> {
  let started = false;
  try {
    for await (const item of first) {
      started = true;
      yield item;
    }
  } catch (error) {
    if (started || signal?.aborted || !(error instanceof LlmError)) throw error;
    yield* fallback();
  }
}
