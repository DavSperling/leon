import type { AgentEvent, AgentTool, ChatMessage, Llm, LlmStep } from './llm';
import { executeAgentTool } from './run-tool';

type FakeCall = { step: LlmStep; system: string; messages: ChatMessage[] };

export type FakeLlmScript = {
  // Les morceaux que streamText rend, dans l'ordre, à chaque appel.
  texts?: string[];
  // Un tour du modèle : ce que runAgent rend pour l'appel n° `call` (0, 1, …), sachant le résultat du dernier outil
  // exécuté (null au premier tour). Un évènement « outil » est exécuté par le faux, sous la limite d'étapes, puis le
  // script est rappelé ; un tour sans « outil » finit la réponse (« fini » s'il ne dit pas « fin » lui-même).
  agent?: (call: number, lastToolResult: string | null) => AgentEvent[];
};

export type FakeLlm = Llm & { calls: FakeCall[] };

// Le faux des tests : rejoue son script, garde chaque appel dans `calls`. Un appel que le script ne prévoit pas
// lève, pour qu'un test mal réglé ne passe pas en silence.
export function createFakeLlm(script: FakeLlmScript): FakeLlm {
  const calls: FakeCall[] = [];
  const record = (request: FakeCall) =>
    calls.push({ step: request.step, system: request.system, messages: [...request.messages] });

  return {
    calls,
    async *streamText(request) {
      record(request);
      if (!script.texts) throw new Error('Faux modèle : le script ne prévoit pas de texts');
      yield* script.texts;
    },
    async *runAgent(request) {
      record(request);
      const { agent } = script;
      if (!agent) throw new Error("Faux modèle : le script ne prévoit pas d'agent");
      let lastToolResult: string | null = null;
      let steps = 0;
      for (let call = 0; ; call++) {
        const events = agent(call, lastToolResult);
        let calledTool = false;
        for (const event of events) {
          if (event.type === 'outil') {
            if (steps >= request.maxSteps) {
              yield { type: 'fin', reason: 'limite' };
              return;
            }
            steps += 1;
            calledTool = true;
            yield event;
            lastToolResult = (await executeAgentTool(request.tools, event.name, event.input)).text;
            continue;
          }
          yield event;
          if (event.type === 'fin') return;
        }
        if (!calledTool) {
          yield { type: 'fin', reason: 'fini' };
          return;
        }
      }
    },
  };
}

// Le faux modèle des démonstrations (LEON_LLM=factice, jamais en production) : déterministe, sans réseau. Il
// répond toujours la même phrase courte qui cite [1] et, dans la discussion, appelle d'abord une fois l'outil
// « chercher » avec la dernière question. Il ne lit pas les résultats : il sert à voir l'interface sans clé.
const DEMO_ANSWER = [
  'Réponse du modèle factice (essai sans clé) : ',
  'la mémoire contient des éléments sur votre question, ',
  'voir le premier résultat [1].',
];

const lastQuestion = (messages: ChatMessage[]): string =>
  messages.findLast((message) => message.role === 'user')?.content ?? '';

export function createDemoLlm(): Llm {
  return {
    async *streamText() {
      yield* DEMO_ANSWER;
    },
    async *runAgent(request) {
      const search: AgentTool | undefined = request.tools.find((tool) => tool.name === 'chercher');
      if (search && request.maxSteps >= 1) {
        const input = { requete: lastQuestion(request.messages) };
        yield { type: 'outil', name: search.name, input };
        await executeAgentTool(request.tools, search.name, input);
      }
      for (const delta of DEMO_ANSWER) yield { type: 'texte', delta };
      yield { type: 'fin', reason: 'fini' };
    },
  };
}
