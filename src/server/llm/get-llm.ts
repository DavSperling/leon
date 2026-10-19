import type { Env } from '../env';
import { createAnthropicLlm } from './anthropic-llm';
import { createDemoLlm } from './fake-llm';
import type { Llm } from './llm';

// Sans clé Anthropic : null, Leon garde et indexe tout mais ne répond pas (la recherche par le texte marche).
// LEON_LLM=factice rend le faux modèle des démonstrations, avant même de regarder la clé : une démo ne dépense
// rien. En production, env.ts refuse déjà de démarrer avec ce réglage.
export function getLlm(env: Env): Llm | null {
  if (env.LEON_LLM === 'factice') return createDemoLlm();
  if (env.ANTHROPIC_API_KEY === undefined) return null;
  return createAnthropicLlm({ apiKey: env.ANTHROPIC_API_KEY, env });
}
