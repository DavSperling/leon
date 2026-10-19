import type { z } from 'zod';

// Les trois étapes qui appellent le modèle : le modèle de chacune se règle (models.ts).
export type LlmStep = 'reponse' | 'discussion' | 'point';

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
