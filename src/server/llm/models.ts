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

// Le modèle Claude de chaque étape : le mieux noté au banc (docs/etudes/resumes-2026-11), pas le moins cher. Choisi
// le 19/11/2026, quand le crédit Anthropic du mois (200 €) a laissé de la marge. Notes sur 100 des trois séries
// (premier passage, mise au point, épreuve finale), Sonnet puis Haiku :
// - réponse en tête : 76, 82 et 70 contre 66, 66 et 57, et Sonnet répond plus vite (2,1 à 2,4 s contre 3,6 à 5,5 s) ;
// - discussion : 80, 84 et 75 contre 77, 77 et 68, et Opus fait mieux que Sonnet : 86 contre 76 à l'essai du
//   19/11/2026 (8 questions, deux passages, deux juges : devant sur 4 questions, derrière sur 1), pour 7,0 centimes
//   la question au lieu de 2,1 et 11 s au lieu de 7 ;
// - point du matin : 67, 84 et 87 contre 63, 73 et 81 ; Opus n'y fait pas mieux que Sonnet (80 contre 83 le 19/11)
//   pour trois fois le prix et 10 s au lieu de 3 ;
// - résumé de session : 83, 87 et 74 contre 73, 80 et 69 ;
// - état d'un fil : 74, 84 et 84 contre 69, 69 et 78 ;
// - agenda : Haiku reste devant, 98, 99 et 97 contre 93, 97 et 61. À l'effort « low », Sonnet écrit sans réfléchir
//   (0 % de ses jetons de sortie au banc, 84 % pour Haiku) et rate des fuseaux et des dates relatives.
// - fiche (le rôle et les tâches d'une personne, portrait/synthese.ts) : Sonnet à l'effort « medium », un choix qui n'a
//   pas été mesuré au banc. L'appel n'a lieu qu'une fois par personne.
// - brouillon (le brouillon de réponse à un mail qui attend, portrait/brouillons.ts) : comme la fiche, Sonnet à
//   l'effort « medium », sans mesure au banc. Un appel par mail, sous un plafond par personne et par jour.
// Opus 5.5 n'a été mesuré que sur la discussion et le point. Le plafond par jour du point (BRIEFING_DAILY_CAP) et de l'agenda borne la dépense.
// C'est aussi le repli d'une étape réglée sur un modèle d'OpenRouter, quand l'appel échoue ou que la clé manque.
const ANTHROPIC_MODEL_BY_STEP = {
  reponse: 'claude-sonnet-5-5',
  discussion: 'claude-opus-5-5',
  point: 'claude-sonnet-5-5',
  resume: 'claude-sonnet-5-5',
  fil: 'claude-sonnet-5-5',
  agenda: 'claude-haiku-5-5',
  fiche: 'claude-sonnet-5-5',
  brouillon: 'claude-sonnet-5-5',
} as const satisfies Record<LlmStep, AnthropicModel>;

// Le modèle préféré de chaque étape : aujourd'hui Claude partout. Du 18 au 19/11/2026, c'étaient les modèles
// d'OpenRouter du banc, à qualité voisine pour 5 à 20 fois moins cher : DeepSeek V4.1 Flash (réponse en tête),
// DeepSeek V4.1 Flash 1017 (discussion, résumé), MiMo V2.6 Flash (fil), GPT-6 Luna (agenda). Ils restent réglables
// par LEON_MODEL_* ; pour en remettre un par défaut : `{ ...ANTHROPIC_MODEL_BY_STEP, fil: 'xiaomi/mimo-v2.6-flash' }`
// (pris seulement avec la clé OpenRouter, et refait chez Anthropic s'il échoue avant tout texte, get-llm.ts).
const PREFERRED_MODEL_BY_STEP: Record<LlmStep, SupportedModel> = ANTHROPIC_MODEL_BY_STEP;

// Variable d'environnement qui remplace le modèle de chaque étape.
export const SETTING_BY_STEP = {
  reponse: 'LEON_MODEL_REPONSE',
  discussion: 'LEON_MODEL_DISCUSSION',
  point: 'LEON_MODEL_POINT',
  resume: 'LEON_MODEL_RESUME',
  fil: 'LEON_MODEL_FIL',
  agenda: 'LEON_MODEL_AGENDA',
  fiche: 'LEON_MODEL_FICHE',
  brouillon: 'LEON_MODEL_BROUILLON',
} as const satisfies Record<LlmStep, keyof Env>;

// L'effort est fixé à chaque étape (son défaut varie selon le modèle) : une réponse de 120 mots n'a pas besoin de
// réfléchir longtemps, la discussion et le point pèsent leurs sources.
export const EFFORT_BY_STEP = {
  reponse: 'low',
  discussion: 'medium',
  point: 'medium',
  resume: 'low',
  fil: 'low',
  agenda: 'low',
  fiche: 'medium',
  brouillon: 'medium',
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
