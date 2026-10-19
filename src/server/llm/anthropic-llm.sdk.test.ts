import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { TEST_ENV } from '@/test/test-env';
import { parseEnv } from '../env';
import { createAnthropicLlm } from './anthropic-llm';
import type { AgentEvent, AgentTool } from './llm';

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

afterEach(() => {
  vi.restoreAllMocks();
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
