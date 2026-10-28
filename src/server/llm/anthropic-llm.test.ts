import { AnthropicError, APIConnectionError, APIError, APIUserAbortError } from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { TEST_ENV } from '@/test/test-env';
import { parseEnv } from '../env';
import { type AnthropicLike, createAnthropicLlm, logUsage, toolDefinitions } from './anthropic-llm';
import { type AgentEvent, type AgentTool, type ChatMessage, LlmError, type LlmStep } from './llm';
import { EFFORT_BY_STEP } from './models';

// L'écriture dans llm_usage : sans base dans ces tests.
const { query } = vi.hoisted(() => ({ query: vi.fn(() => Promise.resolve()) }));
vi.mock('../db/client', () => ({ pool: { query } }));

const messages: ChatMessage[] = [{ role: 'user', content: 'Question ordinaire' }];

type Turn = {
  // Les morceaux de texte que le flux rend avant son message final.
  texts?: string[];
  // Ce qui remplace les champs du message final (contenu, stop_reason, usage…).
  message?: Record<string, unknown>;
  // Une erreur levée par le flux avant le message final.
  fail?: Error;
};

function scriptedStream(turn: Turn) {
  const abort = vi.fn();
  return {
    abort,
    async *[Symbol.asyncIterator]() {
      for (const text of turn.texts ?? []) {
        yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } };
      }
      if (turn.fail) throw turn.fail;
    },
    finalMessage: async () => ({
      model: 'claude-sonnet-5-5',
      role: 'assistant',
      stop_reason: 'end_turn',
      content: [],
      usage: { input_tokens: 10, output_tokens: 5 },
      ...turn.message,
    }),
  };
}

// `turns` : un tour par appel au SDK, le dernier se répète si le modèle est rappelé encore.
function setup(turns: Turn[], settings: Record<string, string> = {}) {
  const streams: ReturnType<typeof scriptedStream>[] = [];
  const stream = vi.fn((_params: unknown, _options?: unknown) => {
    const turn = turns[Math.min(streams.length, turns.length - 1)] as Turn;
    const next = scriptedStream(turn);
    streams.push(next);
    return next;
  });
  const client = { beta: { messages: { stream } } } as unknown as AnthropicLike;
  const llm = createAnthropicLlm({ client, env: parseEnv({ ...TEST_ENV, ...settings }) });
  const params = (call: number) => stream.mock.calls[call]?.[0] as Record<string, unknown>;
  return { llm, stream, streams, params };
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of stream) items.push(item);
  return items;
}

const textRequest = (step: LlmStep = 'reponse', content = 'Question ordinaire') => ({
  step,
  system: 'Consignes du système',
  messages: [{ role: 'user' as const, content }],
  maxTokens: 1234,
});

function chercher(run: (input: { requete: string }) => Promise<string>): AgentTool {
  return {
    name: 'chercher',
    description: 'Cherche dans la mémoire',
    input: z.object({ requete: z.string().trim().min(1) }),
    run: run as AgentTool['run'],
  };
}

const agentRequest = (tools: AgentTool[], maxSteps = 8) => ({
  step: 'discussion' as const,
  system: 'Consignes du système',
  messages,
  tools,
  maxSteps,
  maxTokens: 2000,
});

const toolUse = (id: string, input: unknown, name = 'chercher') => ({
  type: 'tool_use',
  id,
  name,
  input,
});
const toolTurn = (...uses: ReturnType<typeof toolUse>[]): Turn => ({
  message: { stop_reason: 'tool_use', content: uses },
});
const answerTurn = (text: string): Turn => ({
  texts: [text],
  message: { content: [{ type: 'text', text }] },
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('streamText', () => {
  it('rend les morceaux du flux dans l’ordre et journalise l’usage, sans contenu', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { llm } = setup([
      {
        texts: ['Un ', 'deux ', 'trois'],
        message: { usage: { input_tokens: 100, output_tokens: 20 } },
      },
    ]);

    const chunks = await collect(llm.streamText(textRequest('reponse', 'zanzibar-dans-le-prompt')));

    expect(chunks).toEqual(['Un ', 'deux ', 'trois']);
    expect(info).toHaveBeenCalledOnce();
    const [, event, json] = info.mock.calls[0] as [string, string, string];
    expect(event).toBe('llm.usage');
    expect(JSON.parse(json)).toMatchObject({
      step: 'reponse',
      model: 'claude-sonnet-5-5',
      inputTokens: 100,
      outputTokens: 20,
    });
    expect(json).not.toMatch(/zanzibar|Un deux/);
  });

  it.each([
    ['reponse', 'claude-haiku-5-5'],
    ['discussion', 'claude-sonnet-5-5'],
    ['point', 'claude-sonnet-5-5'],
  ] as const)('appelle le modèle, l’effort et la limite de l’étape %s', async (step, model) => {
    const { llm, params, stream } = setup([answerTurn('ok')]);

    await collect(llm.streamText(textRequest(step)));

    expect(params(0)).toMatchObject({
      model,
      max_tokens: 1234,
      messages: [{ role: 'user', content: 'Question ordinaire' }],
      output_config: { effort: EFFORT_BY_STEP[step] },
    });
    expect(params(0)).not.toHaveProperty('thinking');
    expect(params(0)).not.toHaveProperty('tools');
    expect(stream.mock.calls[0]?.[1]).toEqual({ signal: undefined });
  });

  it('prend le modèle réglé par la variable de l’étape', async () => {
    const { llm, params } = setup([answerTurn('ok')], { LEON_MODEL_REPONSE: 'claude-opus-5-5' });

    await collect(llm.streamText(textRequest('reponse')));

    expect(params(0).model).toBe('claude-opus-5-5');
  });

  it('met en cache les consignes, pas le contenu capté', async () => {
    const { llm, params } = setup([answerTurn('ok')]);

    await collect(llm.streamText(textRequest()));

    expect(params(0).system).toEqual([
      { type: 'text', text: 'Consignes du système', cache_control: { type: 'ephemeral' } },
    ]);
    expect(JSON.stringify(params(0).messages)).not.toContain('cache_control');
    expect(params(0)).not.toHaveProperty('cache_control');
  });

  it('active le repli serveur des refus pour Sonnet et Opus, pas pour Haiku', async () => {
    const sonnet = setup([answerTurn('ok')]);
    await collect(sonnet.llm.streamText(textRequest('discussion')));
    expect(sonnet.params(0)).toMatchObject({
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });

    const haiku = setup([answerTurn('ok')]);
    await collect(haiku.llm.streamText(textRequest('reponse')));
    expect(haiku.params(0)).not.toHaveProperty('betas');
    expect(haiku.params(0)).not.toHaveProperty('fallbacks');
  });

  // Le repli suit le modèle réglé pour l'étape (la table de models.ts), pas l'étape ni un préfixe de son nom.
  it.each([
    ['claude-opus-5-5', true],
    ['claude-sonnet-5-5', true],
    ['claude-haiku-5-5', false],
  ])('décide le repli serveur d’après le modèle réglé : %s → %s', async (model, fallback) => {
    const { llm, params } = setup([answerTurn('ok')], { LEON_MODEL_DISCUSSION: model });

    await collect(llm.streamText(textRequest('discussion')));

    expect(params(0).model).toBe(model);
    expect('fallbacks' in params(0)).toBe(fallback);
    expect('betas' in params(0)).toBe(fallback);
    // L'effort part avec chacun des modèles de la table.
    expect(params(0)).toMatchObject({ output_config: { effort: EFFORT_BY_STEP.discussion } });
  });

  it('passe le signal d’annulation au SDK', async () => {
    const { llm, stream } = setup([answerTurn('ok')]);
    const controller = new AbortController();

    await collect(llm.streamText({ ...textRequest(), signal: controller.signal }));

    expect(stream.mock.calls[0]?.[1]).toEqual({ signal: controller.signal });
  });

  it('lève LlmError « refus du modèle » quand le modèle refuse', async () => {
    const { llm } = setup([{ texts: ['Je '], message: { stop_reason: 'refusal' } }]);

    const error = await collect(llm.streamText(textRequest())).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).message).toBe('refus du modèle');
  });

  it.each(['max_tokens', 'model_context_window_exceeded'])(
    'lève LlmError « réponse tronquée » sur le stop_reason %s',
    async (stopReason) => {
      const { llm } = setup([{ texts: ['Début'], message: { stop_reason: stopReason } }]);

      const error = await collect(llm.streamText(textRequest())).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(LlmError);
      expect((error as LlmError).message).toBe('réponse tronquée');
    },
  );

  it.each([
    ['429', new APIError(429, { type: 'error' }, 'Surcharge zanzibar', new Headers())],
    ['500', new APIError(500, { type: 'error' }, 'Panne zanzibar', new Headers())],
    ['aucun', new AnthropicError('Impossible de lire « zanzibar »')],
    ['aucun', new APIConnectionError({ message: 'réseau zanzibar' })],
  ])(
    'remplace l’erreur du SDK (état %s) par un LlmError au message fixe',
    async (status, failure) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { llm } = setup([{ fail: failure }]);

      const thrown = await collect(llm.streamText(textRequest())).catch((e: unknown) => e);

      expect(thrown).toBeInstanceOf(LlmError);
      expect((thrown as LlmError).message).toBe('appel au modèle impossible');
      expect(error).toHaveBeenCalledOnce();
      const [, event, json] = error.mock.calls[0] as [string, string, string];
      expect(event).toBe('llm.appel');
      expect(JSON.parse(json)).toMatchObject({ step: 'reponse', status });
      expect(json).not.toContain('zanzibar');
    },
  );

  it('remplace l’annulation par un LlmError sans bruit dans les journaux', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { llm } = setup([{ fail: new APIUserAbortError() }]);

    const thrown = await collect(llm.streamText(textRequest())).catch((e: unknown) => e);

    expect(thrown).toEqual(new LlmError('appel interrompu'));
    expect(error).not.toHaveBeenCalled();
  });

  it('laisse passer une erreur qui n’est pas celle du SDK : c’est un défaut du code', async () => {
    const { llm } = setup([{ fail: new TypeError('défaut') }]);

    await expect(collect(llm.streamText(textRequest()))).rejects.toBeInstanceOf(TypeError);
  });

  it('abandonne l’appel quand le lecteur arrête avant la fin', async () => {
    const { llm, streams } = setup([{ texts: ['a', 'b', 'c'] }]);

    for await (const _chunk of llm.streamText(textRequest())) break;

    expect(streams[0]?.abort).toHaveBeenCalledOnce();
  });

  it('n’abandonne rien quand la réponse est allée au bout', async () => {
    const { llm, streams } = setup([answerTurn('ok')]);

    await collect(llm.streamText(textRequest()));

    expect(streams[0]?.abort).not.toHaveBeenCalled();
  });
});

describe('runAgent', () => {
  it('appelle l’outil, rend son résultat au modèle, puis laisse le texte : outil, texte, fin', async () => {
    const run = vi.fn(async (_input: { requete: string }) => 'trois résultats');
    const { llm } = setup([
      toolTurn(toolUse('toolu_1', { requete: '  acme  ' })),
      answerTurn('Acme avance [1].'),
    ]);

    const events = await collect(llm.runAgent(agentRequest([chercher(run)])));

    expect(events).toEqual<AgentEvent[]>([
      { type: 'outil', name: 'chercher', input: { requete: '  acme  ' } },
      { type: 'texte', delta: 'Acme avance [1].' },
      { type: 'fin', reason: 'fini' },
    ]);
    // L'outil a reçu son entrée validée par le schéma (espaces retirés), pas celle du modèle.
    expect(run).toHaveBeenCalledExactlyOnceWith({ requete: 'acme' });
  });

  it('renvoie au modèle son tour d’outil et le résultat, dans la conversation suivante', async () => {
    const run = vi.fn(async () => 'trois résultats');
    const { llm, params } = setup([
      toolTurn(toolUse('toolu_1', { requete: 'acme' })),
      answerTurn('Fin.'),
    ]);

    await collect(llm.runAgent(agentRequest([chercher(run)])));

    expect(params(0).messages).toEqual(messages);
    expect(params(1).messages).toEqual([
      ...messages,
      { role: 'assistant', content: [toolUse('toolu_1', { requete: 'acme' })] },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'trois résultats' }],
      },
    ]);
  });

  it('décrit les outils au modèle par le schéma zod, et met en cache la conversation', async () => {
    const { llm, params } = setup([answerTurn('ok')]);

    await collect(llm.runAgent(agentRequest([chercher(async () => 'x')])));

    expect(params(0)).toMatchObject({
      model: 'claude-sonnet-5-5',
      max_tokens: 2000,
      system: [
        { type: 'text', text: 'Consignes du système', cache_control: { type: 'ephemeral' } },
      ],
      cache_control: { type: 'ephemeral' },
      output_config: { effort: EFFORT_BY_STEP.discussion },
      tools: [
        {
          name: 'chercher',
          description: 'Cherche dans la mémoire',
          input_schema: {
            type: 'object',
            properties: { requete: { type: 'string' } },
            required: ['requete'],
          },
        },
      ],
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  });

  it('renvoie au modèle une erreur d’outil, sans lever, quand l’entrée est invalide', async () => {
    const run = vi.fn(async () => 'jamais');
    const { llm, params } = setup([
      toolTurn(toolUse('toolu_1', { requete: 42 })),
      answerTurn('Désolé.'),
    ]);

    const events = await collect(llm.runAgent(agentRequest([chercher(run)])));

    expect(run).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({ type: 'fin', reason: 'fini' });
    const retour = (params(1).messages as Array<{ content: unknown }>).at(-1)?.content;
    expect(retour).toEqual([
      {
        type: 'tool_result',
        tool_use_id: 'toolu_1',
        is_error: true,
        content: expect.stringContaining('Entrée invalide'),
      },
    ]);
  });

  it('exécute tous les outils d’un même tour, dans l’ordre, avec un résultat par appel', async () => {
    const run = vi.fn(async ({ requete }: { requete: string }) => `résultat de ${requete}`);
    const { llm, params } = setup([
      toolTurn(toolUse('toolu_1', { requete: 'a' }), toolUse('toolu_2', { requete: 'b' })),
      answerTurn('Fin.'),
    ]);

    await collect(llm.runAgent(agentRequest([chercher(run)])));

    expect(run.mock.calls.map(([input]) => input.requete)).toEqual(['a', 'b']);
    const retour = (params(1).messages as Array<{ content: unknown }>).at(-1)?.content;
    expect(retour).toEqual([
      { type: 'tool_result', tool_use_id: 'toolu_1', content: 'résultat de a' },
      { type: 'tool_result', tool_use_id: 'toolu_2', content: 'résultat de b' },
    ]);
  });

  it('s’arrête à maxSteps appels d’outil : exactement 2, puis la limite', async () => {
    const run = vi.fn(async () => 'résultat');
    const { llm, stream } = setup([toolTurn(toolUse('toolu_1', { requete: 'x' }))]);

    const events = await collect(llm.runAgent(agentRequest([chercher(run)], 2)));

    expect(run).toHaveBeenCalledTimes(2);
    expect(events.filter((event) => event.type === 'outil')).toHaveLength(2);
    expect(events.at(-1)).toEqual({ type: 'fin', reason: 'limite' });
    // Le modèle a pu répondre après son 2e outil ; il en demande un 3e : on s’arrête là, sans l’exécuter.
    expect(stream).toHaveBeenCalledTimes(3);
  });

  it('respecte la limite même quand un seul tour demande plus d’outils qu’il n’en reste', async () => {
    const run = vi.fn(async () => 'résultat');
    const { llm } = setup([
      toolTurn(
        toolUse('a', { requete: 'x' }),
        toolUse('b', { requete: 'x' }),
        toolUse('c', { requete: 'x' }),
      ),
    ]);

    const events = await collect(llm.runAgent(agentRequest([chercher(run)], 2)));

    expect(run).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toEqual({ type: 'fin', reason: 'limite' });
  });

  it('finit sur « refus » quand le modèle refuse, sans exécuter d’outil', async () => {
    const run = vi.fn(async () => 'jamais');
    const { llm } = setup([
      {
        texts: ['Je '],
        message: { stop_reason: 'refusal', content: [toolUse('toolu_1', { requete: 'x' })] },
      },
    ]);

    const events = await collect(llm.runAgent(agentRequest([chercher(run)])));

    expect(run).not.toHaveBeenCalled();
    expect(events).toEqual([
      { type: 'texte', delta: 'Je ' },
      { type: 'fin', reason: 'refus' },
    ]);
  });

  it.each(['max_tokens', 'model_context_window_exceeded'])(
    'finit sur la limite, sans exécuter l’outil, quand la réponse est coupée (%s)',
    async (stopReason) => {
      const run = vi.fn(async () => 'jamais');
      const { llm } = setup([
        { message: { stop_reason: stopReason, content: [toolUse('toolu_1', { requete: 'x' })] } },
      ]);

      const events = await collect(llm.runAgent(agentRequest([chercher(run)])));

      expect(run).not.toHaveBeenCalled();
      expect(events).toEqual([{ type: 'fin', reason: 'limite' }]);
    },
  );

  it('finit sur la limite quand un texte sans outil est coupé', async () => {
    const { llm } = setup([{ texts: ['Début'], message: { stop_reason: 'max_tokens' } }]);

    const events = await collect(llm.runAgent(agentRequest([])));

    expect(events).toEqual([
      { type: 'texte', delta: 'Début' },
      { type: 'fin', reason: 'limite' },
    ]);
  });

  it('remplace l’erreur du SDK par un LlmError au message fixe', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { llm } = setup([
      toolTurn(toolUse('toolu_1', { requete: 'x' })),
      { fail: new APIError(529, { type: 'error' }, 'Surcharge zanzibar', new Headers()) },
    ]);

    const thrown = await collect(llm.runAgent(agentRequest([chercher(async () => 'r')]))).catch(
      (e: unknown) => e,
    );

    expect(thrown).toEqual(new LlmError('appel au modèle impossible'));
  });

  // Contrat de flux (voir llm.ts) : une panne en cours de route arrive APRÈS les évènements déjà rendus. L'appelant
  // (la discussion, T11) les a vus passer, puis doit traiter l'erreur : dire « indisponible », décider du message.
  it('rend les évènements d’outil déjà produits, puis lève : l’appelant traite les deux', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { llm } = setup([
      toolTurn(toolUse('toolu_1', { requete: 'x' })),
      { fail: new APIError(500, { type: 'error' }, 'Panne zanzibar', new Headers()) },
    ]);
    const events: AgentEvent[] = [];
    let thrown: unknown;

    try {
      for await (const event of llm.runAgent(agentRequest([chercher(async () => 'r')]))) {
        events.push(event);
      }
    } catch (error) {
      thrown = error;
    }

    expect(events).toEqual([{ type: 'outil', name: 'chercher', input: { requete: 'x' } }]);
    expect(thrown).toEqual(new LlmError('appel au modèle impossible'));
  });

  // Un outil que l'API refuserait est un défaut du code : on le dit avant tout appel, pas au premier tour du
  // flux, et sans passer pour une panne du modèle.
  it('vérifie les outils dès l’appel, avant tout flux et sans toucher au SDK', () => {
    const { llm, stream } = setup([answerTurn('ok')]);
    const lire: AgentTool = {
      name: 'lire',
      description: 'Lit un passage ou une source',
      input: z.union([z.object({ passageId: z.string() }), z.object({ sourceId: z.string() })]),
      run: async () => 'x',
    };

    expect(() => llm.runAgent(agentRequest([lire]))).toThrow(/« lire ».*objet/s);
    expect(stream).not.toHaveBeenCalled();
  });

  it('abandonne l’appel quand le lecteur arrête avant la fin', async () => {
    const { llm, streams } = setup([{ texts: ['a', 'b'] }]);

    for await (const _event of llm.runAgent(agentRequest([]))) break;

    expect(streams[0]?.abort).toHaveBeenCalledOnce();
  });

  it('journalise l’usage de chaque tour, sans contenu', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { llm } = setup([
      toolTurn(toolUse('toolu_1', { requete: 'zanzibar' })),
      answerTurn('Fin.'),
    ]);

    await collect(llm.runAgent(agentRequest([chercher(async () => 'zanzibar-résultat')])));

    expect(info).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(info.mock.calls)).not.toContain('zanzibar');
  });

  it('n’exécute ni ne renvoie ce qui précède un repli du serveur : seuls les outils d’après comptent', async () => {
    const run = vi.fn(async ({ requete }: { requete: string }) => `résultat de ${requete}`);
    const fallback = { type: 'fallback', from: { model: 'a' }, to: { model: 'b' } };
    const { llm, params } = setup([
      {
        message: {
          stop_reason: 'tool_use',
          content: [
            { type: 'thinking', thinking: '', signature: 's' },
            toolUse('refuse', { requete: 'avant' }),
            fallback,
            { type: 'text', text: 'Je cherche.' },
            toolUse('garde', { requete: 'apres' }),
          ],
        },
      },
      answerTurn('Fin.'),
    ]);

    await collect(llm.runAgent(agentRequest([chercher(run)])));

    expect(run).toHaveBeenCalledExactlyOnceWith({ requete: 'apres' });
    const [, assistant] = params(1).messages as Array<{ role: string; content: unknown }>;
    expect(assistant).toEqual({
      role: 'assistant',
      content: [
        fallback,
        { type: 'text', text: 'Je cherche.' },
        toolUse('garde', { requete: 'apres' }),
      ],
    });
  });
});

describe('toolDefinitions', () => {
  const outil = (name: string, input: AgentTool['input']): AgentTool => ({
    name,
    description: `Outil ${name}`,
    input,
    run: async () => 'x',
  });

  it('décrit chaque outil : nom, description et schéma de type objet', () => {
    const definitions = toolDefinitions([
      outil('chercher', z.object({ requete: z.string(), outil: z.string().optional() })),
      outil('activite', z.object({})),
    ]);

    expect(definitions).toMatchObject([
      {
        name: 'chercher',
        description: 'Outil chercher',
        input_schema: { type: 'object', required: ['requete'] },
      },
      { name: 'activite', input_schema: { type: 'object' } },
    ]);
  });

  it('refuse une union : la racine du schéma n’a alors pas de type, l’API la refuserait', () => {
    const union = z.union([
      z.object({ passageId: z.string() }),
      z.object({ sourceId: z.string() }),
    ]);

    expect(() => toolDefinitions([outil('lire', union)])).toThrow(/« lire ».*objet/s);
  });

  // La forme à écrire pour « l'un ou l'autre » (l'outil lire de T11, comme le fetch de T07) : un seul objet.
  it('accepte « l’un ou l’autre » écrit en un seul objet à champs facultatifs et un contrôle', () => {
    const lire = z
      .object({ passageId: z.string().optional(), sourceId: z.string().optional() })
      .refine((input) => (input.passageId === undefined) !== (input.sourceId === undefined), {
        message: 'passageId ou sourceId, pas les deux',
      });

    const [definition] = toolDefinitions([outil('lire', lire)]);

    expect(definition?.input_schema.type).toBe('object');
    expect(definition?.input_schema).not.toHaveProperty('required');
  });

  it.each(['', 'lire un passage', 'écrire', 'a'.repeat(65), 'a.b'])(
    'refuse le nom « %s » : l’API n’accepte que lettres, chiffres, _ et -, 64 caractères au plus',
    (name) => {
      expect(() => toolDefinitions([outil(name, z.object({}))])).toThrow(/nom de l'outil/);
    },
  );

  it.each(['chercher', 'lire_source', 'activite-recente', 'a'.repeat(64)])(
    'accepte le nom « %s »',
    (name) => {
      expect(toolDefinitions([outil(name, z.object({}))])[0]?.name).toBe(name);
    },
  );

  it('refuse deux outils du même nom', () => {
    expect(() =>
      toolDefinitions([outil('chercher', z.object({})), outil('chercher', z.object({}))]),
    ).toThrow(/même nom|deux outils/i);
  });
});

describe('logUsage', () => {
  it('journalise les tokens et le coût estimé, sans contenu', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    logUsage('discussion', 'claude-opus-5-5', {
      input_tokens: 1_000_000,
      output_tokens: 100_000,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });

    const [, event, json] = info.mock.calls[0] as [string, string, string];
    expect(event).toBe('llm.usage');
    expect(JSON.parse(json)).toEqual({
      step: 'discussion',
      model: 'claude-opus-5-5',
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 6,
    });
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('insert into llm_usage'), [
      'discussion',
      'claude-opus-5-5',
      1_000_000,
      100_000,
      0,
      0,
      6,
    ]);
  });

  it('compte la lecture et l’écriture du cache, et ne chiffre pas un modèle sans tarif', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    logUsage('reponse', 'claude-haiku-5-5', {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
    });
    logUsage('reponse', 'un-autre-modele', { input_tokens: 1, output_tokens: 1 });

    const [first, second] = info.mock.calls.map(([, , json]) => JSON.parse(json as string));
    expect(first.costUsd).toBeCloseTo(0.135);
    expect(second.costUsd).toBeNull();
  });
});
