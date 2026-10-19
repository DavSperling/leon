import type { Env } from '../env';
import type { LlmStep } from './llm';

// Ce fichier est une feuille à l'exécution : env.ts en importe la liste des modèles (pour refuser un réglage
// inconnu au démarrage), il ne doit donc importer aucune valeur de env.ts (le type Env suffit).

export type ModelSpec = {
  // Le serveur reprend la réponse sur un autre modèle quand celui-ci refuse (« repli », C7). Haiku 5.5 n'en a pas.
  refusalFallback: boolean;
  // Dollars par million de tokens, recopiés de la référence docs/etudes/couts-2026-10/annexes/01-prix-llm.md
  // (page officielle des tarifs, revérifiée le 14/10/2026) : on met l'annexe à jour d'abord, puis cette table (un
  // test de contrat les compare). Ils servent à estimer le coût de chaque appel (logUsage). Écriture du cache de
  // 5 minutes ; Haiku 5.5 : prompt de moins de 100 000 tokens (au-delà, 5 fois plus cher : aucune étape n'en
  // approche, la discussion lit 40 000 caractères au plus).
  price: { input: number; output: number; cacheRead: number; cacheWrite: number };
};

// Les seuls modèles qu'on peut régler (LEON_MODEL_*) : chacun accepte l'effort (`output_config.effort`) que le code
// envoie à chaque appel, et on sait s'il a un repli serveur. Haiku 4.5 et Sonnet 4.5 refuseraient l'effort ; un
// modèle d'une autre génération recevrait un repli que sa documentation ne prévoit pas : chaque appel échouerait
// en 400, et la réponse tomberait en « indisponible » sans que rien ne le dise. Ajouter un modèle, c'est une ligne
// ici (avec son tarif) après avoir lu sa fiche, puis les phrases de .env.example et du README qui le citent.
export const SUPPORTED_MODELS = {
  'claude-haiku-5-5': {
    refusalFallback: false,
    price: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  },
  'claude-sonnet-5-5': {
    refusalFallback: true,
    price: { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  },
  'claude-opus-5-5': {
    refusalFallback: true,
    price: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  },
} as const satisfies Record<string, ModelSpec>;

export type SupportedModel = keyof typeof SUPPORTED_MODELS;

// Pour z.enum (env.ts) : un tableau non vide.
export const SUPPORTED_MODEL_IDS = Object.keys(SUPPORTED_MODELS) as [
  SupportedModel,
  ...SupportedModel[],
];

// La fiche d'un modèle, ou undefined s'il n'est pas dans la table (un modèle de repli, par exemple, que le
// serveur a pris à la place de celui qu'on a demandé).
export function modelSpec(model: string): ModelSpec | undefined {
  return Object.hasOwn(SUPPORTED_MODELS, model)
    ? SUPPORTED_MODELS[model as SupportedModel]
    : undefined;
}

// Choix de la spec du deuxième jet : la réponse en tête est appelée à chaque recherche, elle doit coûter peu
// et répondre vite ; la discussion et le point du matin ont besoin de plus de jugement.
const DEFAULT_MODEL_BY_STEP = {
  reponse: 'claude-haiku-5-5',
  discussion: 'claude-sonnet-5-5',
  point: 'claude-sonnet-5-5',
} as const satisfies Record<LlmStep, SupportedModel>;

// Variable d'environnement qui remplace le modèle de chaque étape.
export const SETTING_BY_STEP = {
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

export function modelForStep(step: LlmStep, env: Env): SupportedModel {
  return env[SETTING_BY_STEP[step]] ?? DEFAULT_MODEL_BY_STEP[step];
}
