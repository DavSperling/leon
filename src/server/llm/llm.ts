import type { z } from 'zod';

// Les étapes qui appellent le modèle : le modèle de chacune se règle (models.ts).
export type LlmStep = 'reponse' | 'discussion' | 'point' | 'resume' | 'fil';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

// Un outil que l'agent peut appeler. `input` valide ce que le modèle envoie : `run` ne reçoit que de l'entrée valide.
// Le résultat est du texte, que l'appelant balise comme donnée avant de le rendre au modèle.
export type AgentTool<I = unknown> = {
  name: string;
  description: string;
  input: z.ZodType<I>;
  run(input: I): Promise<string>;
};

export type AgentEvent =
  | { type: 'texte'; delta: string }
  | { type: 'outil'; name: string; input: unknown }
  // 'fini' : le modèle a répondu ; 'limite' : le nombre d'étapes (ou la longueur) est atteint ; 'refus' : le modèle a refusé.
  | { type: 'fin'; reason: 'fini' | 'limite' | 'refus' };

// Le client réel (anthropic-llm.ts), le faux des tests et le faux de démonstration (fake-llm.ts) en sont les
// trois implémentations.
//
// Comment un flux se termine, et ce que l'appelant doit en faire (les deux fonctions ne le disent pas pareil) :
// - streamText rend des morceaux de texte puis s'arrête. Un refus du modèle ou une réponse coupée (limite de
//   longueur atteinte) lève une LlmError (« refus du modèle », « réponse tronquée ») APRÈS les morceaux déjà rendus :
//   l'appelant (la réponse en tête, T10) a pu en diffuser, et décide s'il masque ce texte partiel ou le garde.
// - runAgent signale les mêmes cas sans lever : fin « refus » et fin « limite » (aussi quand le nombre d'étapes est
//   atteint ou qu'un texte sans outil est coupé). Seule une panne (réseau, 429, 5xx, annulation) lève une LlmError,
//   et elle peut arriver après des évènements « texte » et « outil » déjà rendus : l'appelant (la discussion,
//   T11) traite l'évènement « indisponible » et décide du message qu'il garde.
// - `maxTokens` borne le texte ET la réflexion du modèle (les trois modèles réfléchissent par défaut) : une limite
//   trop juste coupe la réponse avant son premier mot (streamText lève alors « réponse tronquée » sans aucun
//   morceau). Les appelants prévoient de la marge au-delà des mots attendus.
// - Une erreur qui n'est pas une LlmError (un outil au schéma que l'API refuserait, un défaut du code) n'est pas
//   une panne du modèle : elle passe telle quelle.
export interface Llm {
  streamText(request: {
    step: LlmStep;
    system: string;
    messages: ChatMessage[];
    maxTokens: number;
    signal?: AbortSignal;
  }): AsyncIterable<string>;
  runAgent(request: {
    step: LlmStep;
    system: string;
    messages: ChatMessage[];
    tools: AgentTool[];
    maxSteps: number;
    maxTokens: number;
    signal?: AbortSignal;
  }): AsyncIterable<AgentEvent>;
}

// Message fixe : jamais celui du SDK, qui peut citer ce que le modèle a écrit.
export class LlmError extends Error {
  override name = 'LlmError';
}
