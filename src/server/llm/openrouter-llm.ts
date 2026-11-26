import type { Env } from '../env';
import { logError } from '../log';
import { logUsage, toolDefinitions } from './anthropic-llm';
import {
  type AgentEvent,
  type ChatMessage,
  LLM_UNREACHABLE,
  type Llm,
  LlmError,
  type LlmStep,
} from './llm';
import { EFFORT_BY_STEP, modelForStep } from './models';
import { executeAgentTool } from './run-tool';

// Le deuxième client réel (le premier est anthropic-llm.ts), pour les modèles de models.ts que sert OpenRouter (API
// compatible OpenAI). Même contrat que le client Anthropic (llm.ts) : mêmes fins, mêmes erreurs, même journal.

// Adresse fixe, jamais lue dans l'environnement : une autre recevrait les passages captés.
const URL = 'https://openrouter.ai/api/v1/chat/completions';
// Pour tout l'appel, flux compris : au-delà, l'hôte est bloqué et l'utilisateur attend pour rien.
const TIMEOUT_MS = 5 * 60_000;

// Fixe, jamais lu dans l'environnement : les passages captés d'une entreprise ne vont qu'à des hôtes qui ne gardent
// rien (zero data retention) et n'en font rien d'autre, et jamais à un hôte qui sert le modèle quantifié en 4 bits
// (des réponses dégradées sans que rien ne le dise). Ni aux hôtes chinois (siège en Chine, ou à Singapour pour une
// maison mère chinoise, d'après /api/v1/providers d'OpenRouter, 18/11/2026) ni à ceux dont le siège est inconnu :
// nos clients sont aux États-Unis, en Israël et en Europe. Sans hôte qui convienne, OpenRouter refuse l'appel.
// shortcut: liste d'exclusion relevée à la main ; un nouvel hôte chinois passerait. Passer à une liste `only` si un
// client l'exige.
export const PROVIDER = {
  zdr: true,
  data_collection: 'deny',
  quantizations: ['fp8', 'bf16', 'fp16', 'unknown'],
  ignore: [
    'alibaba',
    'antdigital',
    'baidu',
    'deepseek',
    'makora',
    'mancer',
    'minimax',
    'moonshotai',
    'nex-agi',
    'seed',
    'siliconflow',
    'stepfun',
    'streamlake',
    'tencent',
    'xiaomi',
    'z-ai',
  ],
} as const;

type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
type Message =
  | ChatMessage
  | { role: 'assistant'; content: string | null; tool_calls: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };
type Tool = {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
};

type Chunk = {
  model?: string;
  error?: { code?: unknown };
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: {
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
    finish_reason?: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    cost?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
};

// Ce qu'un tour a produit : le texte, les appels d'outil, et pourquoi il s'est arrêté (stop, length, tool_calls,
// content_filter).
type Turn = { text: string; toolCalls: ToolCall[]; finish: string };

type TurnRequest = {
  step: LlmStep;
  system: string;
  messages: Message[];
  maxTokens: number;
  signal?: AbortSignal;
};

// Réseau, réponse en erreur, flux illisible, erreur en cours de flux ou délai dépassé : une erreur à message fixe. Le
// corps de la réponse n'est ni journalisé ni levé (il peut citer le prompt ou les passages captés) : seuls l'étape
// et l'état HTTP.
function failure(step: LlmStep, status: string): LlmError {
  const error = new LlmError(LLM_UNREACHABLE);
  logError('llm.appel', error, { step, status });
  return error;
}

// Les évènements du flux (« data: {...} ») jusqu'à « data: [DONE] ». Les commentaires (« : OPENROUTER PROCESSING »,
// qui gardent la connexion ouverte) et les lignes vides sont sautés. Une ligne illisible lève (SyntaxError).
async function* sseChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<Chunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      yield JSON.parse(data) as Chunk;
    }
  }
}

// Des arguments illisibles vont tels quels à executeAgentTool, qui les refuse (« Entrée invalide ») et le dit au
// modèle, comme une entrée hors schéma. Un outil sans argument peut arriver avec une chaîne vide.
function parseArguments(text: string): unknown {
  try {
    return JSON.parse(text || '{}');
  } catch {
    return text;
  }
}

export function createOpenRouterLlm(options: {
  apiKey: string;
  env: Env;
  fetchImpl?: typeof fetch;
}): Llm {
  const { apiKey, env, fetchImpl = fetch } = options;

  // Un appel au modèle en flux : rend les morceaux de texte au fil de l'eau (mis en forme par `emit`), puis le tour
  // entier. L'appel est abandonné si le lecteur s'arrête avant la fin. L'usage n'arrive qu'à la fin du flux : un
  // appel interrompu, facturé quand même, n'est pas journalisé.
  async function* streamTurn<T>(
    request: TurnRequest,
    tools: Tool[],
    emit: (delta: string) => T,
  ): AsyncGenerator<T, Turn> {
    const model = modelForStep(request.step, env);
    const controller = new AbortController();
    const signals = [controller.signal, AbortSignal.timeout(TIMEOUT_MS)];
    if (request.signal) signals.push(request.signal);
    const calls = new Map<number, ToolCall>();
    let text = '';
    let finish: string | null = null;
    let usage: Chunk['usage'];
    let servedBy: string | undefined;
    try {
      const res = await fetchImpl(URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: true,
          messages: [{ role: 'system', content: request.system }, ...request.messages],
          max_tokens: request.maxTokens,
          // La réflexion compte dans max_tokens et est facturée, mais n'est pas rendue : on ne l'affiche pas.
          reasoning: { effort: EFFORT_BY_STEP[request.step], exclude: true },
          usage: { include: true },
          provider: PROVIDER,
          // Une liste d'outils vide est refusée par certaines API : pas d'outils, pas de champ.
          ...(tools.length > 0 ? { tools } : {}),
        }),
        signal: AbortSignal.any(signals),
      });
      if (!res.ok || !res.body) throw failure(request.step, String(res.status));
      for await (const chunk of sseChunks(res.body)) {
        if (chunk.error) {
          const { code } = chunk.error;
          throw failure(request.step, typeof code === 'number' ? String(code) : 'aucun');
        }
        servedBy = chunk.model ?? servedBy;
        usage = chunk.usage ?? usage;
        for (const choice of chunk.choices ?? []) {
          // Le premier morceau d'un appel d'outil porte son id et son nom, les suivants la suite des arguments.
          for (const delta of choice.delta?.tool_calls ?? []) {
            const index = delta.index ?? 0;
            const call = calls.get(index) ?? {
              id: '',
              type: 'function',
              function: { name: '', arguments: '' },
            };
            call.id ||= delta.id ?? '';
            call.function.name ||= delta.function?.name ?? '';
            call.function.arguments += delta.function?.arguments ?? '';
            calls.set(index, call);
          }
          finish = choice.finish_reason ?? finish;
          const content = choice.delta?.content;
          if (content) {
            text += content;
            yield emit(content);
          }
        }
      }
      // Un flux fini sans raison d'arrêt a été coupé : la réponse est peut-être incomplète.
      if (finish === null || finish === 'error') throw failure(request.step, 'aucun');
      return { text, toolCalls: [...calls.values()], finish };
    } catch (error) {
      if (request.signal?.aborted) throw new LlmError('appel interrompu');
      throw error instanceof LlmError ? error : failure(request.step, 'aucun');
    } finally {
      // Fini, interrompu ou en échec : la connexion est libérée (sans effet sur un flux lu jusqu'au bout).
      controller.abort();
      if (usage) {
        const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
        logUsage(
          request.step,
          servedBy ?? model,
          {
            input_tokens: usage.prompt_tokens - cached,
            output_tokens: usage.completion_tokens,
            cache_read_input_tokens: cached,
          },
          usage.cost,
        );
      }
    }
  }

  // Même boucle que celle du client Anthropic (agentLoop) : un évènement par appel d'outil, un nombre d'appels exact,
  // une fin « limite » ou « refus ».
  // shortcut: la réflexion n'est ni rendue ni renvoyée entre deux tours d'outil (exclude: true) ; certains modèles
  // (ceux d'OpenAI, MiniMax) raisonnent mieux quand on leur rend leurs reasoning_details. À revoir si le banc trouve
  // la discussion moins bonne sur ces modèles.
  async function* agentLoop(
    request: Parameters<Llm['runAgent']>[0],
    tools: Tool[],
  ): AsyncGenerator<AgentEvent> {
    const conversation: Message[] = [...request.messages];
    let steps = 0;
    for (;;) {
      const turn = yield* streamTurn<AgentEvent>(
        { ...request, messages: conversation },
        tools,
        (delta) => ({ type: 'texte', delta }),
      );
      if (turn.finish === 'content_filter') {
        yield { type: 'fin', reason: 'refus' };
        return;
      }
      // Un outil coupé net par la limite de longueur a des arguments incomplets : on ne l'exécute pas.
      const truncated = turn.finish === 'length';
      if (turn.toolCalls.length === 0 || truncated) {
        yield { type: 'fin', reason: truncated ? 'limite' : 'fini' };
        return;
      }
      conversation.push({
        role: 'assistant',
        content: turn.text || null,
        tool_calls: turn.toolCalls,
      });
      for (const call of turn.toolCalls) {
        if (steps >= request.maxSteps) {
          yield { type: 'fin', reason: 'limite' };
          return;
        }
        steps += 1;
        const input = parseArguments(call.function.arguments);
        yield { type: 'outil', name: call.function.name, input };
        const result = await executeAgentTool(request.tools, call.function.name, input);
        conversation.push({ role: 'tool', tool_call_id: call.id, content: result.text });
      }
    }
  }

  return {
    async *streamText(request) {
      const turn = yield* streamTurn(request, [], (delta) => delta);
      if (turn.finish === 'content_filter') throw new LlmError('refus du modèle');
      if (turn.finish === 'length') throw new LlmError('réponse tronquée');
    },

    runAgent(request) {
      // Un outil que l'API refuserait est un défaut du code : on le dit tout de suite, avant le flux.
      const tools = toolDefinitions(request.tools).map(
        (tool): Tool => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description ?? '',
            parameters: tool.input_schema,
          },
        }),
      );
      return agentLoop(request, tools);
    },
  };
}
