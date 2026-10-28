import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { TEST_ENV } from '@/test/test-env';
import { parseEnv } from '../env';
import { createAnthropicLlm } from './anthropic-llm';
import { type AgentEvent, type AgentTool, LlmError } from './llm';

// L'écriture dans llm_usage : sans base dans ces tests.
vi.mock('../db/client', () => ({ pool: { query: () => Promise.resolve() } }));

// Ces tests passent par le vrai SDK, sur un faux réseau : ils gardent ce que les faux flux de
// anthropic-llm.test.ts supposent du SDK (forme des évènements, message final, entrée d'outil recomposée, en-tête
// de la bêta). Les réponses reprennent le format des évènements de la documentation officielle de l'API.
// Aucun appel réseau : la fonction `fetch` du client est remplacée.

const sse = (events: Array<{ type: string } & Record<string, unknown>>) =>
  events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');

const start = () => ({
  type: 'message_start',
  message: {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 25, output_tokens: 1 },
  },
});
const end = (stopReason: string) => [
  {
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: 15 },
  },
  { type: 'message_stop' },
];
const text = (index: number, parts: string[]) => [
  { type: 'content_block_start', index, content_block: { type: 'text', text: '' } },
  ...parts.map((part) => ({
    type: 'content_block_delta',
    index,
    delta: { type: 'text_delta', text: part },
  })),
  { type: 'content_block_stop', index },
];

const textAnswer = sse([start(), ...text(0, ['Un ', 'deux ', 'trois']), ...end('end_turn')]);
const toolCall = sse([
  start(),
  ...text(0, ['Je cherche.']),
  {
    type: 'content_block_start',
    index: 1,
    content_block: { type: 'tool_use', id: 'toolu_01', name: 'chercher', input: {} },
  },
  {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'input_json_delta', partial_json: '{"requete": ' },
  },
  {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'input_json_delta', partial_json: '"  acme  "}' },
  },
  { type: 'content_block_stop', index: 1 },
  ...end('tool_use'),
]);

function fakeNetwork(bodies: string[]) {
  const requests: Array<{ headers: Headers; body: Record<string, unknown> }> = [];
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    requests.push({
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    const body = bodies[Math.min(requests.length - 1, bodies.length - 1)] as string;
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  });
  const client = new Anthropic({ apiKey: 'cle-de-test', fetch, maxRetries: 0 });
  const llm = createAnthropicLlm({ client, env: parseEnv(TEST_ENV) });
  return { llm, requests };
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of stream) items.push(item);
  return items;
}

// Une réflexion du modèle : les modèles de Leon réfléchissent par défaut, et la réflexion compte dans max_tokens.
const thinking = (index: number, summary = 'Je pèse les sources.') => [
  {
    type: 'content_block_start',
    index,
    content_block: { type: 'thinking', thinking: '', signature: '' },
  },
  { type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: summary } },
  {
    type: 'content_block_delta',
    index,
    delta: {
      type: 'signature_delta',
      signature: 'EqQBCgIYAhIM1gbcDa9GJwZA2b3hGgxBdjrkzLoky3dl1pkiMOYds',
    },
  },
  { type: 'content_block_stop', index },
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('createAnthropicLlm avec le vrai SDK', () => {
  it('lit un flux de texte et envoie la requête attendue, avec l’en-tête du repli serveur', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { llm, requests } = fakeNetwork([textAnswer]);

    const chunks = await collect(
      llm.streamText({
        step: 'discussion',
        system: 'Consignes',
        messages: [{ role: 'user', content: 'Question' }],
        maxTokens: 321,
      }),
    );

    expect(chunks).toEqual(['Un ', 'deux ', 'trois']);
    const [request] = requests;
    expect(request?.body).toMatchObject({
      model: 'claude-sonnet-5-5',
      max_tokens: 321,
      stream: true,
      system: [{ type: 'text', text: 'Consignes', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: 'Question' }],
      output_config: { effort: 'medium' },
      fallbacks: 'default',
    });
    expect(request?.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
  });

  it('recompose l’entrée d’un outil, l’exécute, puis lit la réponse qui suit', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const run = vi.fn(async (_input: { requete: string }) => 'trois résultats');
    const chercher: AgentTool = {
      name: 'chercher',
      description: 'Cherche dans la mémoire',
      input: z.object({ requete: z.string().trim() }),
      run: run as AgentTool['run'],
    };
    const { llm, requests } = fakeNetwork([toolCall, textAnswer]);

    const events = await collect(
      llm.runAgent({
        step: 'discussion',
        system: 'Consignes',
        messages: [{ role: 'user', content: 'Où en est Acme ?' }],
        tools: [chercher],
        maxSteps: 8,
        maxTokens: 500,
      }),
    );

    expect(events).toEqual<AgentEvent[]>([
      { type: 'texte', delta: 'Je cherche.' },
      { type: 'outil', name: 'chercher', input: { requete: '  acme  ' } },
      { type: 'texte', delta: 'Un ' },
      { type: 'texte', delta: 'deux ' },
      { type: 'texte', delta: 'trois' },
      { type: 'fin', reason: 'fini' },
    ]);
    expect(run).toHaveBeenCalledExactlyOnceWith({ requete: 'acme' });
    const suite = requests[1]?.body.messages as Array<{ role: string; content: unknown }>;
    expect(suite.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
    expect(suite[2]?.content).toEqual([
      { type: 'tool_result', tool_use_id: 'toolu_01', content: 'trois résultats' },
    ]);
    expect(requests[0]?.body.tools).toMatchObject([
      { name: 'chercher', input_schema: { type: 'object', required: ['requete'] } },
    ]);
  });
});

// Le contrat du flux (voir llm.ts) tel que le vrai SDK le produit : la réflexion et les coupures y comptent.
describe('createAnthropicLlm avec le vrai SDK : réflexion, coupure et refus', () => {
  const run = vi.fn(async (_input: { requete: string }) => 'résultats');
  const chercher: AgentTool = {
    name: 'chercher',
    description: 'Cherche dans la mémoire',
    input: z.object({ requete: z.string() }),
    run: run as AgentTool['run'],
  };
  const textRequest = {
    step: 'discussion' as const,
    system: 'Consignes',
    messages: [{ role: 'user' as const, content: 'Question' }],
    maxTokens: 500,
  };
  const agentRequest = { ...textRequest, tools: [chercher], maxSteps: 8 };

  it('rend le texte seul quand la réflexion le précède : la réflexion n’est jamais diffusée', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { llm } = fakeNetwork([
      sse([start(), ...thinking(0), ...text(1, ['Un ', 'deux']), ...end('end_turn')]),
    ]);

    expect(await collect(llm.streamText(textRequest))).toEqual(['Un ', 'deux']);
  });

  // Les trois modèles réfléchissent par défaut et la réflexion se paie sur max_tokens : un maxTokens trop juste
  // coupe la réponse avant son premier mot. Les appelants (T10, T11, T13) prévoient donc de la marge.
  it('lève « réponse tronquée » sans aucun texte quand la réflexion mange toute la limite', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { llm } = fakeNetwork([sse([start(), ...thinking(0), ...end('max_tokens')])]);
    const chunks: string[] = [];
    let thrown: unknown;

    try {
      for await (const chunk of llm.streamText({ ...textRequest, maxTokens: 50 }))
        chunks.push(chunk);
    } catch (error) {
      thrown = error;
    }

    expect(chunks).toEqual([]);
    expect(thrown).toEqual(new LlmError('réponse tronquée'));
  });

  it('lève « refus du modèle » APRÈS un texte partiel : l’appelant a déjà reçu des morceaux', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { llm } = fakeNetwork([sse([start(), ...text(0, ['Je ', 'ne ']), ...end('refusal')])]);
    const chunks: string[] = [];
    let thrown: unknown;

    try {
      for await (const chunk of llm.streamText(textRequest)) chunks.push(chunk);
    } catch (error) {
      thrown = error;
    }

    expect(chunks).toEqual(['Je ', 'ne ']);
    expect(thrown).toEqual(new LlmError('refus du modèle'));
  });

  it('runAgent, lui, signale le refus partiel et la coupure par une fin, sans lever', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const refus = fakeNetwork([sse([start(), ...text(0, ['Je ']), ...end('refusal')])]);
    const coupe = fakeNetwork([sse([start(), ...thinking(0), ...end('max_tokens')])]);

    expect(await collect(refus.llm.runAgent(agentRequest))).toEqual<AgentEvent[]>([
      { type: 'texte', delta: 'Je ' },
      { type: 'fin', reason: 'refus' },
    ]);
    expect(await collect(coupe.llm.runAgent(agentRequest))).toEqual<AgentEvent[]>([
      { type: 'fin', reason: 'limite' },
    ]);
  });

  it('renvoie au modèle sa réflexion et sa signature, inchangées, avec le résultat d’outil', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const avecReflexion = sse([
      start(),
      ...thinking(0),
      {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'toolu_01', name: 'chercher', input: {} },
      },
      {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"requete": "acme"}' },
      },
      { type: 'content_block_stop', index: 1 },
      ...end('tool_use'),
    ]);
    const { llm, requests } = fakeNetwork([avecReflexion, textAnswer]);

    const events = await collect(llm.runAgent(agentRequest));

    expect(events.at(-1)).toEqual({ type: 'fin', reason: 'fini' });
    const suite = requests[1]?.body.messages as Array<{ role: string; content: unknown[] }>;
    expect(suite[1]?.role).toBe('assistant');
    expect(suite[1]?.content[0]).toMatchObject({
      type: 'thinking',
      thinking: 'Je pèse les sources.',
      signature: 'EqQBCgIYAhIM1gbcDa9GJwZA2b3hGgxBdjrkzLoky3dl1pkiMOYds',
    });
    expect(suite[1]?.content[1]).toMatchObject({ type: 'tool_use', id: 'toolu_01' });
  });
});

// Le SDK lit en silence des réglages dans l'environnement du serveur : l'adresse de l'API, un jeton, le niveau de
// journal (« debug » écrit les corps de requête). Leon fixe les trois : un terminal qui les exporte ne redirige
// pas les passages captés et n'écrit aucun texte capté dans les journaux.
describe('le client Anthropic que Leon construit lui-même', () => {
  it('ignore ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN et ANTHROPIC_LOG', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://autre-hote.invalid');
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'jeton-etranger');
    vi.stubEnv('ANTHROPIC_LOG', 'debug');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const requests: Array<{ url: string; headers: Headers }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: RequestInit) => {
        requests.push({ url: String(url), headers: new Headers(init?.headers) });
        return new Response(textAnswer, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );
    const llm = createAnthropicLlm({ apiKey: 'cle-de-test', env: parseEnv(TEST_ENV) });

    const chunks = await collect(
      llm.streamText({
        step: 'reponse',
        system: 'Consignes',
        messages: [{ role: 'user', content: 'Texte capté zanzibar' }],
        maxTokens: 100,
      }),
    );

    expect(chunks.join('')).toBe('Un deux trois');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toMatch(/^https:\/\/api\.anthropic\.com\//);
    expect(requests[0]?.headers.get('authorization')).toBeNull();
    expect(requests[0]?.headers.get('x-api-key')).toBe('cle-de-test');
    expect(debug).not.toHaveBeenCalled();
  });
});
