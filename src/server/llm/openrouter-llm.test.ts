import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { TEST_ENV } from '@/test/test-env';
import { parseEnv } from '../env';
import { type AgentTool, LlmError } from './llm';
import { createOpenRouterLlm } from './openrouter-llm';

// L'écriture dans appels_modele : sans base dans ces tests.
const { query } = vi.hoisted(() => ({ query: vi.fn(() => Promise.resolve()) }));
vi.mock('../db/client', () => ({ pool: { query } }));

const env = parseEnv({
  ...TEST_ENV,
  OPENROUTER_API_KEY: 'cle-de-test',
  LEON_MODEL_REPONSE: 'openai/gpt-6-luna',
  LEON_MODEL_DISCUSSION: 'deepseek/deepseek-v4.1-flash',
});

// Un flux comme OpenRouter l'envoie : un évènement « data: » par objet, une chaîne telle quelle (commentaire,
// [DONE]). Les octets arrivent par paquets de 7, coupés n'importe où (au milieu d'une ligne ou d'un « é »).
function sse(...events: unknown[]): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(
    events.map((e) => (typeof e === 'string' ? e : `data: ${JSON.stringify(e)}\n\n`)).join(''),
  );
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
      controller.close();
    },
  });
}
const text = (content: string) => ({
  model: 'openai/gpt-6-luna',
  choices: [{ delta: { content } }],
});
const finish = (reason: string) => ({ choices: [{ delta: {}, finish_reason: reason }] });
const DONE = 'data: [DONE]\n\n';

// `turns` : un corps par appel, le dernier se répète si le modèle est rappelé encore.
type FakeTurn = (init: RequestInit) => Response;
function setup(turns: FakeTurn[]) {
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init: RequestInit = {}) => {
    const turn = turns[Math.min(fetchImpl.mock.calls.length - 1, turns.length - 1)] as FakeTurn;
    return turn(init);
  });
  const llm = createOpenRouterLlm({ apiKey: 'cle-de-test', env, fetchImpl });
  const init = (call: number) => fetchImpl.mock.calls[call]?.[1] as RequestInit;
  const body = (call: number) => JSON.parse(init(call).body as string);
  return { llm, fetchImpl, init, body };
}
const ok =
  (...events: unknown[]): FakeTurn =>
  () =>
    new Response(sse(...events));

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of stream) items.push(item);
  return items;
}

const textRequest = (signal?: AbortSignal) => ({
  step: 'reponse' as const,
  system: 'Consignes du système',
  messages: [{ role: 'user' as const, content: 'Où en est Acme ?' }],
  maxTokens: 1234,
  signal,
});

const chercher = (run: (input: { requete: string }) => Promise<string>): AgentTool => ({
  name: 'chercher',
  description: 'Cherche dans la mémoire',
  input: z.object({ requete: z.string().trim().min(1) }),
  run: run as AgentTool['run'],
});

const agentRequest = (tools: AgentTool[], maxSteps = 8) => ({
  step: 'discussion' as const,
  system: 'Consignes du système',
  messages: [{ role: 'user' as const, content: 'Question ordinaire' }],
  tools,
  maxSteps,
  maxTokens: 2000,
});

// Un appel d'outil comme il arrive en flux : l'id et le nom d'abord, puis les arguments en morceaux.
const toolCallTurn = (id: string, args: string) =>
  ok(
    { choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name: 'chercher' } }] } }] },
    ...[args.slice(0, 5), args.slice(5)].map((part) => ({
      choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: part } }] } }],
    })),
    finish('tool_calls'),
    DONE,
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe('streamText', () => {
  it('rend les morceaux dans l’ordre, en sautant les commentaires du flux', async () => {
    const { llm, fetchImpl, init, body } = setup([
      ok(
        ': OPENROUTER PROCESSING\n\n',
        text('Un '),
        text('été '),
        text('trois'),
        finish('stop'),
        DONE,
      ),
    ]);

    const chunks = await collect(llm.streamText(textRequest()));

    expect(chunks).toEqual(['Un ', 'été ', 'trois']);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init(0).headers).toMatchObject({ authorization: 'Bearer cle-de-test' });
    expect(body(0)).toMatchObject({
      model: 'openai/gpt-6-luna',
      stream: true,
      max_tokens: 1234,
      messages: [
        { role: 'system', content: 'Consignes du système' },
        { role: 'user', content: 'Où en est Acme ?' },
      ],
      reasoning: { effort: 'low', exclude: true },
      usage: { include: true },
    });
    expect(body(0)).not.toHaveProperty('tools');
  });

  // Les passages captés ne vont qu'à des hôtes sans rétention et jamais à un modèle quantifié en 4 bits.
  it('envoie le même bloc provider à chaque appel, texte comme agent', async () => {
    const { llm, body } = setup([ok(text('ok'), finish('stop'), DONE)]);

    await collect(llm.streamText(textRequest()));
    await collect(llm.runAgent(agentRequest([])));

    for (const call of [0, 1]) {
      expect(body(call).provider).toMatchObject({
        zdr: true,
        data_collection: 'deny',
        quantizations: ['fp8', 'bf16', 'fp16', 'unknown'],
      });
      expect(body(call).provider.ignore).toEqual(
        expect.arrayContaining(['deepseek', 'z-ai', 'siliconflow']),
      );
    }
  });

  it('lève « réponse tronquée » après le texte déjà rendu quand la limite de longueur est atteinte', async () => {
    const { llm } = setup([ok(text('Début'), finish('length'), DONE)]);
    const chunks: string[] = [];

    const thrown = await (async () => {
      for await (const chunk of llm.streamText(textRequest())) chunks.push(chunk);
    })().catch((e: unknown) => e);

    expect(chunks).toEqual(['Début']);
    expect(thrown).toEqual(new LlmError('réponse tronquée'));
  });

  it('lève « refus du modèle » quand le filtre de contenu arrête la réponse', async () => {
    const { llm } = setup([ok(finish('content_filter'), DONE)]);

    await expect(collect(llm.streamText(textRequest()))).rejects.toEqual(
      new LlmError('refus du modèle'),
    );
  });

  it.each([
    ['500', () => new Response('{"error":{"message":"Panne zanzibar"}}', { status: 500 })],
    ['aucun', ok(text('a'), 'data: {zanzibar illisible\n\n')],
    ['aucun', ok(text('a'))],
    [
      'aucun',
      () => {
        throw new TypeError('réseau zanzibar');
      },
    ],
  ])(
    'lève un LlmError au message fixe (état %s), sans le corps de la réponse',
    async (status, turn) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { llm } = setup([turn]);

      const thrown = await collect(llm.streamText(textRequest())).catch((e: unknown) => e);

      expect(thrown).toEqual(new LlmError('appel au modèle impossible'));
      expect(error).toHaveBeenCalledOnce();
      const [, event, json] = error.mock.calls[0] as [string, string, string];
      expect(event).toBe('llm.appel');
      expect(JSON.parse(json)).toMatchObject({ step: 'reponse', status });
      expect(json).not.toContain('zanzibar');
    },
  );

  it('lève un LlmError quand le flux porte une erreur en cours de route, après le texte rendu', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { llm } = setup([
      ok(
        text('a'),
        {
          error: { code: 502, message: 'Hôte en panne zanzibar' },
          choices: [{ delta: { content: '' }, finish_reason: 'error' }],
        },
        DONE,
      ),
    ]);
    const chunks: string[] = [];

    const thrown = await (async () => {
      for await (const chunk of llm.streamText(textRequest())) chunks.push(chunk);
    })().catch((e: unknown) => e);

    expect(chunks).toEqual(['a']);
    expect(thrown).toEqual(new LlmError('appel au modèle impossible'));
    expect(JSON.parse(error.mock.calls[0]?.[2] as string)).toMatchObject({ status: '502' });
    expect(JSON.stringify(error.mock.calls)).not.toContain('zanzibar');
  });

  it('abandonne l’appel quand le lecteur arrête avant la fin', async () => {
    const { llm, init } = setup([ok(text('a'), text('b'), finish('stop'), DONE)]);

    for await (const _chunk of llm.streamText(textRequest())) break;

    expect(init(0).signal?.aborted).toBe(true);
  });

  it('remplace l’annulation de l’appelant par « appel interrompu », sans bruit dans les journaux', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Comme fetch : le corps rend un morceau, puis échoue quand le signal de la requête est annulé.
    const { llm } = setup([
      ({ signal }) =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify(text('a'))}\n\n`),
              );
              signal?.addEventListener('abort', () => controller.error(signal.reason));
            },
          }),
        ),
    ]);
    const leaving = new AbortController();
    const chunks: string[] = [];

    const thrown = await (async () => {
      for await (const chunk of llm.streamText(textRequest(leaving.signal))) {
        chunks.push(chunk);
        leaving.abort();
      }
    })().catch((e: unknown) => e);

    expect(chunks).toEqual(['a']);
    expect(thrown).toEqual(new LlmError('appel interrompu'));
    expect(error).not.toHaveBeenCalled();
  });

  it('journalise ce qu’OpenRouter a facturé et le modèle qui a servi, sans contenu', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    query.mockClear();
    const { llm } = setup([
      ok(
        text('zanzibar'),
        finish('stop'),
        {
          model: 'openai/gpt-6-luna-20261101',
          choices: [],
          usage: {
            prompt_tokens: 1000,
            completion_tokens: 200,
            cost: 0.0042,
            prompt_tokens_details: { cached_tokens: 400 },
          },
        },
        DONE,
      ),
    ]);

    await collect(llm.streamText(textRequest()));

    expect(info).toHaveBeenCalledOnce();
    const [, event, json] = info.mock.calls[0] as [string, string, string];
    expect(event).toBe('llm.usage');
    expect(JSON.parse(json)).toEqual({
      step: 'reponse',
      model: 'openai/gpt-6-luna-20261101',
      inputTokens: 600,
      outputTokens: 200,
      cacheReadTokens: 400,
      cacheWriteTokens: 0,
      costUsd: 0.0042,
    });
    expect(json).not.toContain('zanzibar');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('insert into appels_modele'), [
      'reponse',
      'openai/gpt-6-luna-20261101',
      600,
      200,
      400,
      0,
      0.0042,
    ]);
  });
});

describe('runAgent', () => {
  it('appelle l’outil, renvoie son résultat au modèle, puis rend le texte : outil, texte, fin', async () => {
    const run = vi.fn(async () => 'Acme signe jeudi');
    const { llm, body } = setup([
      toolCallTurn('call_1', '{"requete":"acme"}'),
      ok(text('Jeudi.'), finish('stop'), DONE),
    ]);

    const events = await collect(llm.runAgent(agentRequest([chercher(run)])));

    expect(events).toEqual([
      { type: 'outil', name: 'chercher', input: { requete: 'acme' } },
      { type: 'texte', delta: 'Jeudi.' },
      { type: 'fin', reason: 'fini' },
    ]);
    expect(run).toHaveBeenCalledWith({ requete: 'acme' });
    expect(body(0).model).toBe('deepseek/deepseek-v4.1-flash');
    expect(body(0).reasoning).toEqual({ effort: 'medium', exclude: true });
    expect(body(0).tools).toMatchObject([
      {
        type: 'function',
        function: {
          name: 'chercher',
          description: 'Cherche dans la mémoire',
          parameters: { type: 'object', required: ['requete'] },
        },
      },
    ]);
    expect(body(1).messages.slice(2)).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'chercher', arguments: '{"requete":"acme"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'Acme signe jeudi' },
    ]);
  });

  it('renvoie au modèle une erreur d’outil, sans lever, quand les arguments sont illisibles', async () => {
    const run = vi.fn(async () => 'jamais');
    const { llm, body } = setup([
      toolCallTurn('call_1', '{"requete":'),
      ok(text('Je reformule.'), finish('stop'), DONE),
    ]);

    const events = await collect(llm.runAgent(agentRequest([chercher(run)])));

    expect(run).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({ type: 'fin', reason: 'fini' });
    expect(body(1).messages.at(-1)).toMatchObject({
      role: 'tool',
      tool_call_id: 'call_1',
      content: expect.stringContaining('Entrée invalide'),
    });
  });

  it('s’arrête à maxSteps appels d’outil, puis la limite', async () => {
    const run = vi.fn(async () => 'r');
    const { llm } = setup([toolCallTurn('call_1', '{"requete":"x"}')]);

    const events = await collect(llm.runAgent(agentRequest([chercher(run)], 2)));

    expect(run).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toEqual({ type: 'fin', reason: 'limite' });
  });

  it('n’exécute pas un outil coupé par la limite de longueur : fin « limite »', async () => {
    const run = vi.fn(async () => 'r');
    const { llm } = setup([
      ok(
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, id: 'c', function: { name: 'chercher', arguments: '{"re' } },
                ],
              },
            },
          ],
        },
        finish('length'),
        DONE,
      ),
    ]);

    const events = await collect(llm.runAgent(agentRequest([chercher(run)])));

    expect(run).not.toHaveBeenCalled();
    expect(events).toEqual([{ type: 'fin', reason: 'limite' }]);
  });

  it('finit sur « refus » quand le filtre de contenu arrête la réponse', async () => {
    const { llm } = setup([ok(finish('content_filter'), DONE)]);

    expect(await collect(llm.runAgent(agentRequest([])))).toEqual([
      { type: 'fin', reason: 'refus' },
    ]);
  });
});
