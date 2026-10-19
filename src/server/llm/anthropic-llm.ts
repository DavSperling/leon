import Anthropic, { AnthropicError, APIError, APIUserAbortError } from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { Env } from '../env';
import { logError } from '../log';
import {
  type AgentEvent,
  type AgentTool,
  type ChatMessage,
  type Llm,
  LlmError,
  type LlmStep,
} from './llm';
import { EFFORT_BY_STEP, modelForStep } from './models';
import { executeAgentTool } from './run-tool';

export type AnthropicLike = Pick<Anthropic, 'beta'>;

type Message = Anthropic.Beta.BetaMessage;
type ContentBlock = Anthropic.Beta.BetaContentBlock;
type ToolUseBlock = Anthropic.Beta.BetaToolUseBlock;

// Repli serveur des refus (D12) : Sonnet et Opus seulement, Haiku n'en a pas.
const hasRefusalFallback = (model: string) => !model.startsWith('claude-haiku');
const REFUSAL_FALLBACK = {
  betas: ['server-side-fallback-2026-07-01'],
  fallbacks: 'default' as const,
};

const TRUNCATED_STOP_REASONS = ['max_tokens', 'model_context_window_exceeded'];
const isTruncated = (stopReason: string | null | undefined) =>
  stopReason != null && TRUNCATED_STOP_REASONS.includes(stopReason);

// Tarifs en dollars par million de tokens, recopiés de la référence docs/etudes/couts-2026-10/annexes/01-prix-llm.md
// (page officielle des tarifs, revérifiée le 14/10/2026) : on met l'annexe à jour d'abord, puis cette table.
// Prompts de moins de 100 000 tokens pour Haiku 5.5. Ils servent à estimer le coût de chaque appel.
const PRICE_PER_MTOK: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

// Journalise les compteurs de tokens et le coût estimé d'un appel, jamais son contenu.
// La table llm_usage (PR #13 de David) n'est pas sur cette branche : à la fusion avec main, cette ligne
// deviendra une écriture dans la table, dont le check sur `step` devra accepter reponse, discussion et point.
export function logUsage(step: LlmStep, model: string, usage: Usage | undefined): void {
  if (!usage) return;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  const price = PRICE_PER_MTOK[model];
  const costUsd = price
    ? (usage.input_tokens * price.input +
        usage.output_tokens * price.output +
        cacheReadTokens * price.cacheRead +
        cacheWriteTokens * price.cacheWrite) /
      1_000_000
    : null;
  const line = {
    step,
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens,
    cacheWriteTokens,
    costUsd: costUsd === null ? null : Number(costUsd.toFixed(5)),
  };
  console.info('[leon]', 'llm.usage', JSON.stringify(line));
}

// Le SDK (réseau, 429, 5xx, annulation, flux illisible) devient une erreur à message fixe : son message peut citer
// le prompt ou ce que le modèle a écrit. On ne journalise que l'étape et l'état HTTP. Une autre erreur est un
// défaut du code : elle passe telle quelle.
function toLlmError(step: LlmStep, error: unknown): unknown {
  if (error instanceof APIUserAbortError) return new LlmError('appel interrompu');
  if (!(error instanceof AnthropicError)) return error;
  const status =
    error instanceof APIError && error.status !== undefined ? String(error.status) : 'aucun';
  const failure = new LlmError('appel au modèle impossible');
  logError('llm.appel', failure, { step, status });
  return failure;
}

type TurnRequest = {
  step: LlmStep;
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  maxTokens: number;
  signal?: AbortSignal;
};

export function createAnthropicLlm(
  options: ({ apiKey: string } | { client: AnthropicLike }) & { env: Env },
): Llm {
  const client: AnthropicLike =
    'client' in options ? options.client : new Anthropic({ apiKey: options.apiKey });
  const { env } = options;

  // Un appel au modèle en flux : rend les morceaux de texte au fil de l'eau (mis en forme par `emit`), puis le
  // message final, dont l'usage est journalisé. L'appel est abandonné si le lecteur s'arrête avant la fin.
  async function* streamTurn<T>(
    request: TurnRequest,
    extra: Record<string, unknown>,
    emit: (delta: string) => T,
  ): AsyncGenerator<T, Message> {
    const model = modelForStep(request.step, env);
    // Les consignes sont identiques d'un appel à l'autre : en cache, relues à 0,1x. Le contenu capté ne l'est pas.
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: request.maxTokens,
        system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
        messages: [...request.messages],
        output_config: { effort: EFFORT_BY_STEP[request.step] },
        ...(hasRefusalFallback(model) ? REFUSAL_FALLBACK : {}),
        ...extra,
      },
      { signal: request.signal },
    );
    let finished = false;
    try {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield emit(event.delta.text);
        }
      }
      const message = await stream.finalMessage();
      finished = true;
      logUsage(request.step, message.model ?? model, message.usage);
      return message;
    } catch (error) {
      throw toLlmError(request.step, error);
    } finally {
      if (!finished) stream.abort();
    }
  }

  const toParam = (message: ChatMessage): Anthropic.Beta.BetaMessageParam => ({
    role: message.role,
    content: message.content,
  });

  return {
    async *streamText(request) {
      const message = yield* streamTurn(
        { ...request, messages: request.messages.map(toParam) },
        {},
        (delta) => delta,
      );
      if (message.stop_reason === 'refusal') throw new LlmError('refus du modèle');
      if (isTruncated(message.stop_reason)) throw new LlmError('réponse tronquée');
    },

    // La boucle d'outils est écrite à la main plutôt qu'avec l'outil d'appel d'outils du SDK (bêta) : il nous faut
    // un évènement par appel, un nombre d'appels exact, et une fin « limite » ou « refus » qu'il n'expose pas.
    // Les entrées d'outil sont courtes (une requête) : pas de flux anticipé des entrées, elles sont validées de
    // toute façon par le schéma zod de l'outil avant d'être exécutées.
    async *runAgent(request): AsyncGenerator<AgentEvent> {
      const tools = request.tools.map(toToolDefinition);
      const conversation = request.messages.map(toParam);
      let steps = 0;
      for (;;) {
        const message = yield* streamTurn<AgentEvent>(
          { ...request, messages: conversation },
          // La conversation grossit à chaque outil et se relit à chaque tour : le cache d'ensemble la rend
          // 10 fois moins chère dès le deuxième tour.
          { tools, cache_control: { type: 'ephemeral' } },
          (delta) => ({ type: 'texte', delta }),
        );
        if (message.stop_reason === 'refusal') {
          yield { type: 'fin', reason: 'refus' };
          return;
        }
        const content = withoutDeclinedPartial(message.content);
        const toolUses = content.filter(
          (block): block is ToolUseBlock => block.type === 'tool_use',
        );
        // Un outil coupé net par la limite de longueur a une entrée incomplète : on ne l'exécute pas.
        if (toolUses.length === 0 || isTruncated(message.stop_reason)) {
          yield { type: 'fin', reason: isTruncated(message.stop_reason) ? 'limite' : 'fini' };
          return;
        }
        conversation.push({
          role: 'assistant',
          content: content as Anthropic.Beta.BetaContentBlockParam[],
        });
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const use of toolUses) {
          if (steps >= request.maxSteps) {
            yield { type: 'fin', reason: 'limite' };
            return;
          }
          steps += 1;
          yield { type: 'outil', name: use.name, input: use.input };
          const result = await executeAgentTool(request.tools, use.name, use.input);
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: result.text,
            ...(result.isError ? { is_error: true } : {}),
          });
        }
        conversation.push({ role: 'user', content: results });
      }
    },
  };
}

// Après un repli du serveur en cours de réponse, le modèle de secours n'accepte pas, avant la dernière marque de
// repli, la réflexion ni les appels d'outil du modèle qui a refusé : on ne les rend pas, on ne les exécute pas.
const DECLINED_BEFORE_FALLBACK = ['thinking', 'redacted_thinking', 'tool_use'];
function withoutDeclinedPartial(content: ContentBlock[]): ContentBlock[] {
  const boundary = content.findLastIndex((block) => block.type === 'fallback');
  if (boundary === -1) return content;
  return content.filter(
    (block, index) => index >= boundary || !DECLINED_BEFORE_FALLBACK.includes(block.type),
  );
}

function toToolDefinition(tool: AgentTool): Anthropic.Beta.BetaTool {
  // `io: 'input'` : ce que le modèle doit envoyer (un champ qui a un défaut est facultatif pour lui).
  const schema = z.toJSONSchema(tool.input, { io: 'input', reused: 'ref' });
  if (schema.type !== 'object') {
    throw new Error(`Le schéma de l'outil « ${tool.name} » doit décrire un objet`);
  }
  return {
    name: tool.name,
    description: tool.description,
    input_schema: schema as Anthropic.Beta.BetaTool['input_schema'],
  };
}
