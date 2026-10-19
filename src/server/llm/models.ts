import type { Env } from '../env';
import type { LlmStep } from './llm';

// Choix de la spec du deuxième jet : la réponse en tête est appelée à chaque recherche, elle doit coûter peu
// et répondre vite ; la discussion et le point du matin ont besoin de plus de jugement.
const DEFAULT_MODEL_BY_STEP = {
  reponse: 'claude-haiku-5-5',
  discussion: 'claude-sonnet-5-5',
  point: 'claude-sonnet-5-5',
} as const satisfies Record<LlmStep, string>;

// Variable d'environnement qui remplace le modèle de chaque étape.
const SETTING_BY_STEP = {
  reponse: 'LEON_MODEL_REPONSE',
  discussion: 'LEON_MODEL_DISCUSSION',
  point: 'LEON_MODEL_POINT',
} as const satisfies Record<LlmStep, keyof Env>;

// L'effort est fixé à chaque étape (son défaut varie selon le modèle) : une réponse de 120 mots sur Haiku n'a
// pas besoin de réfléchir longtemps, la discussion et le point pèsent leurs sources.
export const EFFORT_BY_STEP = {
  reponse: 'low',
  discussion: 'medium',
  point: 'medium',
} as const satisfies Record<LlmStep, 'low' | 'medium' | 'high'>;

export function modelForStep(step: LlmStep, env: Env): string {
  return env[SETTING_BY_STEP[step]] ?? DEFAULT_MODEL_BY_STEP[step];
}
