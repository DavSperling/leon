import Anthropic, { AnthropicError, APIError, APIUserAbortError } from '@anthropic-ai/sdk';
import { z } from 'zod';
import { pool } from '../db/client';
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
import { EFFORT_BY_STEP, modelForStep, modelSpec, SUPPORTED_MODELS } from './models';
import { executeAgentTool } from './run-tool';

// Adresse de l'API Anthropic : fixe, jamais lue dans l'environnement (voir createAnthropicLlm).
const ANTHROPIC_URL = 'https://api.anthropic.com';

export type AnthropicLike = Pick<Anthropic, 'beta'>;

type Message = Anthropic.Beta.BetaMessage;
type ContentBlock = Anthropic.Beta.BetaContentBlock;
type ToolUseBlock = Anthropic.Beta.BetaToolUseBlock;

// Repli serveur des refus (D12) : la table de models.ts dit quels modèles en ont un (Sonnet et Opus, pas Haiku).
const REFUSAL_FALLBACK = {
  betas: ['server-side-fallback-2026-07-01'],
  fallbacks: 'default' as const,
};

const TRUNCATED_STOP_REASONS = ['max_tokens', 'model_context_window_exceeded'];
const isTruncated = (stopReason: string | null | undefined) =>
  stopReason != null && TRUNCATED_STOP_REASONS.includes(stopReason);

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

// Journalise les compteurs de tokens et le coût estimé d'un appel, jamais son contenu. Le coût vient des tarifs de
// models.ts ; c'est un minimum : après un repli du serveur, les tentatives refusées (`usage.iterations`) ne sont
// pas comptées, et un modèle de repli absent de la table n'est pas chiffré.
// La ligne va aussi dans appels_modele (0039), que lit le tableau des admins. Sans attendre et sans lever : la réponse
// de l'utilisateur ne doit ni ralentir ni échouer à cause de son journal.
export function logUsage(step: LlmStep, model: string, usage: Usage | undefined): void {
  if (!usage) return;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  const price = modelSpec(model)?.price;
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
  void pool
    .query(
      `insert into appels_modele (step, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                              cost_usd)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        step,
        model.slice(0, 100),
        line.inputTokens,
        line.outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        line.costUsd,
      ],
    )
    .catch((error) => logError('llm.usage', error));
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
    'client' in options
      ? options.client
      : new Anthropic({
          apiKey: options.apiKey,
          // Le SDK lit en silence ces réglages dans l'environnement du serveur : on les fixe. Une autre adresse
          // recevrait les passages captés ; un jeton étranger s'ajouterait à la clé ; ANTHROPIC_LOG=debug
          // écrirait le corps des requêtes dans les journaux, où aucun texte capté ne doit aller. (Les en-têtes
          // d'ANTHROPIC_CUSTOM_HEADERS, eux, ne partent que vers cette adresse fixe.)
          baseURL: ANTHROPIC_URL,
          authToken: null,
          logLevel: 'warn',
        });
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
        ...(SUPPORTED_MODELS[model].refusalFallback ? REFUSAL_FALLBACK : {}),
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

  // La boucle d'outils est écrite à la main plutôt qu'avec l'outil d'appel d'outils du SDK (bêta) : il nous faut
  // un évènement par appel, un nombre d'appels exact, et une fin « limite » ou « refus » qu'il n'expose pas.
  // Les entrées d'outil sont courtes (une requête) : pas de flux anticipé des entrées, elles sont validées de
  // toute façon par le schéma zod de l'outil avant d'être exécutées.
  async function* agentLoop(
    request: Parameters<Llm['runAgent']>[0],
    tools: Anthropic.Beta.BetaTool[],
  ): AsyncGenerator<AgentEvent> {
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
      const toolUses = content.filter((block): block is ToolUseBlock => block.type === 'tool_use');
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
  }

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

    runAgent(request) {
      // Un outil que l'API refuserait est un défaut du code : on le dit tout de suite, avant le flux.
      return agentLoop(request, toolDefinitions(request.tools));
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

// Les outils tels que l'API les attend. Elle exige un nom de 1 à 64 caractères (lettres, chiffres, _ et -), un
// nom unique, et un schéma dont la racine est de type objet : une union (« passageId ou sourceId ») n'a pas de
// type à la racine, elle s'écrit en un seul objet à champs facultatifs avec un contrôle (.refine). Une erreur
// ici est un défaut du code, pas une panne du modèle : une erreur franche, pas une LlmError. Un test de
// contrat de chaque liste d'outils (T11) appelle cette fonction.
export function toolDefinitions(tools: AgentTool[]): Anthropic.Beta.BetaTool[] {
  const names = new Set<string>();
  return tools.map((tool) => {
    if (!TOOL_NAME.test(tool.name)) {
      throw new Error(
        `Le nom de l'outil « ${tool.name} » n'est pas valide (lettres, chiffres, _ et -, 64 caractères au plus)`,
      );
    }
    if (names.has(tool.name)) throw new Error(`Deux outils portent le même nom : « ${tool.name} »`);
    names.add(tool.name);
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
  });
}
const TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;
