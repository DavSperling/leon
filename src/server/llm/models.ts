import type { Env } from '../env';
import type { LlmStep } from './llm';

// Ce fichier est une feuille à l'exécution : env.ts en importe la liste des modèles (pour refuser un réglage
// inconnu au démarrage), il ne doit donc importer aucune valeur de env.ts (le type Env suffit).

export type ModelSpec = {
  // Qui sert le modèle : Anthropic en direct, ou OpenRouter (un compte pour les modèles d'OpenAI, DeepSeek, Z.ai…).
  provider: 'anthropic' | 'openrouter';
  // Le serveur reprend la réponse sur un autre modèle quand celui-ci refuse (« repli », C7). Haiku 5.5 n'en a pas.
  refusalFallback: boolean;
  // Dollars par million de tokens, recopiés de la référence docs/etudes/couts-2026-10/annexes/01-prix-llm.md
  // (page officielle des tarifs, revérifiée le 14/10/2026) : on met l'annexe à jour d'abord, puis cette table (un
  // test de contrat les compare). Ils servent à estimer le coût de chaque appel (logUsage). Écriture du cache de
  // 5 minutes ; Haiku 5.5 : prompt de moins de 100 000 tokens (au-delà, 5 fois plus cher : aucune étape n'en
  // approche, la discussion lit 40 000 caractères au plus).
  price: { input: number; output: number; cacheRead: number; cacheWrite: number };
};

function openRouter(input: number, output: number) {
  return {
    provider: 'openrouter',
    refusalFallback: false,
    price: { input, output, cacheRead: input, cacheWrite: input },
  } as const;
}

// Les seuls modèles qu'on peut régler (LEON_MODEL_*) : chacun accepte l'effort (`output_config.effort`, ou
// `reasoning.effort` chez OpenRouter) que le code envoie à chaque appel, et on sait s'il a un repli serveur. Haiku
// 4.5 et Sonnet 4.5 refuseraient l'effort ; un modèle d'une autre génération recevrait un repli que sa
// documentation ne prévoit pas : chaque appel échouerait en 400, et la réponse tomberait en « indisponible » sans
// que rien ne le dise. Ajouter un modèle, c'est une ligne ici (avec son tarif) après avoir lu sa fiche, puis les
// phrases de .env.example et du README qui le citent.
export const SUPPORTED_MODELS = {
  'claude-haiku-5-5': {
    provider: 'anthropic',
    refusalFallback: false,
    price: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  },
  'claude-sonnet-5-5': {
    provider: 'anthropic',
    refusalFallback: true,
    price: { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  },
  'claude-opus-5-5': {
    provider: 'anthropic',
    refusalFallback: true,
    price: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  },
  // Par OpenRouter, rangés sous leur nom OpenRouter. Aucun repli serveur. Le cache n'est pas chiffré par la liste
  // d'OpenRouter : lu et écrit au prix d'entrée (une estimation haute) ; le coût journalisé est de toute façon celui
  // qu'OpenRouter facture (usage.cost).
  'z-ai/glm-5.3-flash': openRouter(0.15, 0.5),
  'deepseek/deepseek-v4.1-flash': openRouter(0.051, 0.203),
  'deepseek/deepseek-v4.1-flash-1017': openRouter(0.036, 0.5),
  'xiaomi/mimo-v2.6-flash': openRouter(0.14, 0.28),
  'minimax/minimax-m3.1-flash': openRouter(0.15, 0.6),
  'openai/gpt-6-luna': openRouter(0.1, 0.5),
  'openai/gpt-6.1-terra': openRouter(1, 5),
  'openai/gpt-6.2-sol': openRouter(2, 10),
} as const satisfies Record<string, ModelSpec>;

export type SupportedModel = keyof typeof SUPPORTED_MODELS;

// Pour z.enum (env.ts) : un tableau non vide.
export const SUPPORTED_MODEL_IDS = Object.keys(SUPPORTED_MODELS) as [
  SupportedModel,
  ...SupportedModel[],
];

type AnthropicModel = {
  [M in SupportedModel]: (typeof SUPPORTED_MODELS)[M]['provider'] extends 'anthropic' ? M : never;
}[SupportedModel];

// La fiche d'un modèle, ou undefined s'il n'est pas dans la table (un modèle de repli, par exemple, que le
// serveur a pris à la place de celui qu'on a demandé).
export function modelSpec(model: string): ModelSpec | undefined {
  return Object.hasOwn(SUPPORTED_MODELS, model)
    ? SUPPORTED_MODELS[model as SupportedModel]
    : undefined;
}

// Choix de la spec du deuxième jet : la réponse en tête est appelée à chaque recherche, elle doit coûter peu
// et répondre vite ; la discussion et le point du matin ont besoin de plus de jugement. Essayé le 16/11/2026 sur une
// vraie session : Haiku coûte dix fois moins, mais comprend moins ce qui se passe et met la routine en tête ; le point
// reste sur Sonnet, et son plafond par jour (BRIEFING_DAILY_CAP) borne la dépense. Le résumé d'une session
// (D8 du plan de la mémoire des sessions) est écrit à chaque session close : il doit coûter peu. L'état d'un fil
// (D23 du plan de la mémoire à disposition) est réécrit après chaque résumé : de même.
// C'est aussi le repli de chaque étape quand son modèle préféré passe par OpenRouter et que la clé manque.
const ANTHROPIC_MODEL_BY_STEP = {
  reponse: 'claude-haiku-5-5',
  discussion: 'claude-sonnet-5-5',
  point: 'claude-sonnet-5-5',
  resume: 'claude-haiku-5-5',
  fil: 'claude-haiku-5-5',
  agenda: 'claude-haiku-5-5',
} as const satisfies Record<LlmStep, AnthropicModel>;

// Le modèle que chaque étape prend quand la clé OpenRouter est là. Choisi au banc des modèles par étape
// (docs/etudes/resumes-2026-11, 18/11/2026 : 19 modèles, puis les finalistes sur 52 cas neufs, deux vérificateurs et
// une contre-vérification à l'aveugle), notes sur 100, série de mise au point puis épreuve finale :
// - réponse en tête : DeepSeek V4.1 Flash 72 et 76, contre Haiku 66 et 57, au même prix et deux fois plus vite ;
// - discussion : DeepSeek V4.1 Flash 1017 83 et 71, contre Sonnet 84 et 75 (dans le bruit), vingt fois moins cher ;
// - point du matin : Sonnet reste devant (84 et 87 ; le meilleur des autres, 79 et 79) ;
// - résumé de session : DeepSeek V4.1 Flash 1017 89 et 84, contre Haiku 80 et 69 ;
// - état d'un fil : MiMo V2.6 Flash 82 et 78, contre Haiku 69 et 78 ;
// - agenda : GPT-6 Luna 100 et 100, contre Haiku 99 et 97.
// Un appel OpenRouter qui échoue avant tout texte est refait chez Anthropic (get-llm.ts).
const PREFERRED_MODEL_BY_STEP = {
  reponse: 'deepseek/deepseek-v4.1-flash',
  discussion: 'deepseek/deepseek-v4.1-flash-1017',
  point: 'claude-sonnet-5-5',
  resume: 'deepseek/deepseek-v4.1-flash-1017',
  fil: 'xiaomi/mimo-v2.6-flash',
  agenda: 'openai/gpt-6-luna',
} as const satisfies Record<LlmStep, SupportedModel>;

// Variable d'environnement qui remplace le modèle de chaque étape.
export const SETTING_BY_STEP = {
  reponse: 'LEON_MODEL_REPONSE',
  discussion: 'LEON_MODEL_DISCUSSION',
  point: 'LEON_MODEL_POINT',
  resume: 'LEON_MODEL_RESUME',
  fil: 'LEON_MODEL_FIL',
  agenda: 'LEON_MODEL_AGENDA',
} as const satisfies Record<LlmStep, keyof Env>;

// L'effort est fixé à chaque étape (son défaut varie selon le modèle) : une réponse de 120 mots sur Haiku n'a
// pas besoin de réfléchir longtemps, la discussion et le point pèsent leurs sources.
export const EFFORT_BY_STEP = {
  reponse: 'low',
  discussion: 'medium',
  point: 'medium',
  resume: 'low',
  fil: 'low',
  agenda: 'low',
} as const satisfies Record<LlmStep, 'low' | 'medium' | 'high'>;

// La variable de l'étape d'abord (env.ts refuse au démarrage un modèle d'OpenRouter sans sa clé), puis le modèle
// préféré, sauf s'il passe par OpenRouter sans clé : le modèle Anthropic de l'étape, pour que le développement, les
// tests et un déploiement sans clé OpenRouter marchent comme avant.
export function pickModel(
  step: LlmStep,
  env: Env,
  preferred: Record<LlmStep, SupportedModel>,
  anthropic: Record<LlmStep, AnthropicModel>,
): SupportedModel {
  const model = env[SETTING_BY_STEP[step]] ?? preferred[step];
  if (SUPPORTED_MODELS[model].provider === 'openrouter' && env.OPENROUTER_API_KEY === undefined) {
    return anthropic[step];
  }
  return model;
}

export function modelForStep(step: LlmStep, env: Env): SupportedModel {
  return pickModel(step, env, PREFERRED_MODEL_BY_STEP, ANTHROPIC_MODEL_BY_STEP);
}
