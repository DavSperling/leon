import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { JugeOutputSchema } from '@/essai/judge';
import { ExtractionOutputSchema } from '@/server/pipeline/prompts/extraction';
import { PlacementOutputSchema } from '@/server/pipeline/prompts/placement';
import { TriageOutputSchema } from '@/server/pipeline/prompts/triage';
import { LlmError, type LlmRequest, type LlmStep } from './llm';
import { createOpenRouterLlm, OPENROUTER_URL, strictJsonSchema } from './openrouter-llm';

afterEach(() => vi.restoreAllMocks());

const Schema = z.object({ answer: z.string() });
const MODEL = 'mistralai/mistral-large-4-0';

function request(step: LlmStep = 'extraction', prompt = 'Question ordinaire') {
  return {
    step,
    system: 'Consignes du système',
    prompt,
    schema: Schema,
    maxTokens: 1234,
  } satisfies LlmRequest<{ answer: string }>;
}

type Body = Record<string, unknown>;

const completion = (surcharge: Body = {}, message: Body = {}): Body => ({
  model: MODEL,
  choices: [
    {
      finish_reason: 'stop',
      message: { role: 'assistant', content: '{"answer":"oui"}', refusal: null, ...message },
    },
  ],
  usage: {
    prompt_tokens: 1000,
    completion_tokens: 200,
    prompt_tokens_details: { cached_tokens: 400 },
    cost: 0.00123,
  },
  ...surcharge,
});

function setup(reply: () => Response | Promise<Response>) {
  const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => reply());
  const llm = createOpenRouterLlm({
    apiKey: 'cle-de-test',
    models: { extraction: MODEL, triage: 'openai/gpt-5.4-mini' },
    fetch: fetch as unknown as typeof globalThis.fetch,
  });
  return { fetch, llm };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const quiet = () => vi.spyOn(console, 'info').mockImplementation(() => {});

describe('createOpenRouterLlm', () => {
  it('envoie le modèle de l étape, les consignes, la limite et le schéma strict', async () => {
    quiet();
    const { llm, fetch } = setup(() => json(completion()));

    const result = await llm.generateObject(request('extraction'));

    expect(result).toEqual({ answer: 'oui' });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(OPENROUTER_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer cle-de-test',
      'Content-Type': 'application/json',
      'X-Title': 'Leon',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      model: MODEL,
      max_tokens: 1234,
      messages: [
        { role: 'system', content: 'Consignes du système' },
        { role: 'user', content: 'Question ordinaire' },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'sortie', strict: true, schema: strictJsonSchema(Schema) },
      },
      usage: { include: true },
      provider: { require_parameters: true, allow_fallbacks: true },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('prend le modèle propre à chaque étape', async () => {
    quiet();
    const { llm, fetch } = setup(() => json(completion()));

    await llm.generateObject(request('triage'));

    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).model).toBe('openai/gpt-5.4-mini');
  });

  it('refuse une étape sans modèle configuré, sans appeler OpenRouter', async () => {
    const { llm, fetch } = setup(() => json(completion()));

    await expect(llm.generateObject(request('placement'))).rejects.toThrow(/placement/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('transmet le coût facturé par OpenRouter et les tokens à onUsage', async () => {
    quiet();
    const { llm } = setup(() => json(completion()));
    const onUsage = vi.fn(async () => {});

    await llm.generateObject({ ...request(), onUsage });

    expect(onUsage).toHaveBeenCalledWith({
      step: 'extraction',
      model: MODEL,
      inputTokens: 600, // 1000 dont 400 lus en cache, comptés à part comme chez Anthropic
      outputTokens: 200,
      cacheReadTokens: 400,
      cacheWriteTokens: 0,
      costUsd: 0.00123,
    });
  });

  it('garde le modèle réellement servi et un coût inconnu à null', async () => {
    quiet();
    const { llm } = setup(() =>
      json(
        completion({
          model: 'mistralai/mistral-large-4-0-20261001',
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      ),
    );
    const onUsage = vi.fn(async () => {});

    await llm.generateObject({ ...request(), onUsage });

    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'mistralai/mistral-large-4-0-20261001',
        inputTokens: 10,
        cacheReadTokens: 0,
        costUsd: null,
      }),
    );
  });

  it('journalise l usage sans contenu', async () => {
    const info = quiet();
    const { llm } = setup(() => json(completion()));

    await llm.generateObject(request('extraction', 'zanzibar'));

    expect(info).toHaveBeenCalledOnce();
    const [, event, line] = info.mock.calls[0] as [string, string, string];
    expect(event).toBe('llm.usage');
    expect(JSON.parse(line)).toMatchObject({ step: 'extraction', model: MODEL, costUsd: 0.00123 });
    expect(JSON.stringify(info.mock.calls)).not.toContain('zanzibar');
    expect(JSON.stringify(info.mock.calls)).not.toContain('oui');
  });

  it('un onUsage qui rejette ne fait pas échouer un appel déjà facturé', async () => {
    quiet();
    const { llm } = setup(() => json(completion()));
    const onUsage = vi.fn(async () => {
      throw new Error('écriture ratée');
    });

    await expect(llm.generateObject({ ...request(), onUsage })).resolves.toEqual({
      answer: 'oui',
    });
  });

  it.each([
    ['une réponse tronquée', completion({}), { finish: 'length' }, 'réponse tronquée'],
    ['un refus', completion({}, { content: null, refusal: 'Non.' }), {}, 'refus du modèle'],
    ['un filtre de contenu', completion({}), { finish: 'content_filter' }, 'refus du modèle'],
    [
      'du JSON invalide',
      completion({}, { content: '{"answer": zanzibar' }),
      {},
      'sortie non conforme',
    ],
    [
      'un écart au schéma',
      completion({}, { content: '{"zanzibar":1}' }),
      {},
      'sortie non conforme',
    ],
    ['un contenu absent', completion({}, { content: null }), {}, 'sortie non conforme'],
  ])('transforme %s en LlmError', async (_cas, body, options, message) => {
    quiet();
    const choices = body.choices as Array<Body>;
    if ('finish' in options) (choices[0] as Body).finish_reason = options.finish;
    const { llm } = setup(() => json(body));
    const onUsage = vi.fn(async () => {});

    const error = await llm.generateObject({ ...request(), onUsage }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).message).toBe(message);
    expect((error as LlmError).message).not.toContain('zanzibar');
    // L'appel est facturé même quand la sortie est inutilisable : il est compté.
    expect(onUsage).toHaveBeenCalledOnce();
  });

  it.each([408, 429, 500, 502, 503])(
    'lève une erreur ordinaire sur un HTTP %i (pg-boss reprendra)',
    async (status) => {
      const { llm } = setup(() => json({ error: { message: 'zanzibar surcharge' } }, status));

      const error = await llm.generateObject(request()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(LlmError);
      expect((error as Error).message).toBe(`OpenRouter : HTTP ${status}`);
    },
  );

  it.each([400, 401, 402, 404])('lève une LlmError sur un HTTP %i', async (status) => {
    const { llm } = setup(() => json({ error: { message: 'zanzibar invalide' } }, status));

    const error = await llm.generateObject(request()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LlmError);
    expect((error as Error).message).toBe(`OpenRouter : HTTP ${status}`);
  });

  it('lève une erreur ordinaire quand le réseau échoue', async () => {
    const { llm } = setup(() => {
      throw new TypeError('fetch failed zanzibar');
    });

    const error = await llm.generateObject(request()).catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(LlmError);
    expect((error as Error).message).toBe('OpenRouter : erreur réseau');
  });

  it('traite une erreur rendue dans un corps 200 selon son code', async () => {
    const surcharge = setup(() => json({ error: { code: 502, message: 'zanzibar' } }));
    const refus = setup(() => json({ error: { code: 400, message: 'zanzibar' } }));

    const e1 = await surcharge.llm.generateObject(request()).catch((e: unknown) => e);
    const e2 = await refus.llm.generateObject(request()).catch((e: unknown) => e);

    expect(e1).not.toBeInstanceOf(LlmError);
    expect((e1 as Error).message).toBe('OpenRouter : HTTP 502');
    expect(e2).toBeInstanceOf(LlmError);
    expect((e2 as Error).message).toBe('OpenRouter : HTTP 400');
  });

  it('note le fournisseur qui a servi l appel avec le modèle (modèle@fournisseur)', async () => {
    const info = quiet();
    const { llm } = setup(() => json(completion({ provider: 'Mistral' })));
    const onUsage = vi.fn(async () => {});

    await llm.generateObject({ ...request(), onUsage });

    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ model: `${MODEL}@Mistral` }));
    const [, , line] = info.mock.calls[0] as [string, string, string];
    expect(JSON.parse(line).model).toBe(`${MODEL}@Mistral`);
  });

  it('ajoute le coût amont d une clé propre (BYOK) au coût OpenRouter', async () => {
    quiet();
    const { llm } = setup(() =>
      json(
        completion({
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            cost: 0.0001,
            is_byok: true,
            cost_details: { upstream_inference_cost: 0.002 },
          },
        }),
      ),
    );
    const onUsage = vi.fn(async () => {});

    await llm.generateObject({ ...request(), onUsage });

    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ costUsd: expect.closeTo(0.0021, 10) }),
    );
  });

  it('lève une erreur ordinaire, après avoir compté l appel, sur finish_reason error', async () => {
    quiet();
    const body = completion();
    (body.choices as Body[])[0] = { finish_reason: 'error', message: { content: null } };
    const { llm } = setup(() => json(body));
    const onUsage = vi.fn(async () => {});

    const error = await llm.generateObject({ ...request(), onUsage }).catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(LlmError);
    expect((error as Error).message).toBe('OpenRouter : erreur du fournisseur');
    expect(onUsage).toHaveBeenCalledOnce();
  });

  it('compte l usage présent dans une réponse d erreur ou mal formée', async () => {
    quiet();
    const usage = { prompt_tokens: 10, completion_tokens: 5, cost: 0.0004 };
    for (const body of [
      { error: { code: 502, message: 'x' }, usage },
      { choices: 'pas une liste', usage },
    ]) {
      const { llm } = setup(() => json(body));
      const onUsage = vi.fn(async () => {});
      await llm.generateObject({ ...request(), onUsage }).catch(() => {});
      expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ costUsd: 0.0004 }));
    }
  });

  it('lève une erreur ordinaire quand OpenRouter dépasse le délai', async () => {
    const { llm } = setup(() => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });

    const error = await llm.generateObject(request()).catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(LlmError);
    expect((error as Error).message).toBe('OpenRouter : délai dépassé');
  });

  it('ne cite jamais la clé ni le prompt dans les messages d erreur', async () => {
    quiet();
    const replies = [
      () => json({}, 500),
      () => json({}, 400),
      () => json(completion({}, { content: 'zanzibar-dans-le-prompt' })),
    ];
    for (const reply of replies) {
      const { llm } = setup(reply);
      const error = await llm
        .generateObject(request('extraction', 'zanzibar-dans-le-prompt'))
        .catch((e: unknown) => e);
      expect((error as Error).message).not.toContain('zanzibar');
      expect((error as Error).message).not.toContain('cle-de-test');
    }
  });
});

// Contrôle le sous-ensemble de JSON Schema que le mode strict d'OpenAI (et donc OpenRouter) accepte :
// chaque objet ferme ses propriétés et les rend toutes obligatoires, un champ nullable s'écrit
// anyOf ou type [x, "null"], et aucun mot-clé hors de la liste.
const STRICT_KEYWORDS = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'anyOf',
  'description',
]);

function problemesStrict(schema: unknown, chemin = '#'): string[] {
  if (typeof schema !== 'object' || schema === null) return [`${chemin} n'est pas un schéma`];
  const s = schema as Record<string, unknown>;
  const problemes = Object.keys(s)
    .filter((k) => !STRICT_KEYWORDS.has(k))
    .map((k) => `${chemin} : mot-clé ${k} refusé`);
  if (s.type === 'object') {
    const props = (s.properties ?? {}) as Record<string, unknown>;
    if (s.additionalProperties !== false) problemes.push(`${chemin} : additionalProperties`);
    const required = new Set((s.required ?? []) as string[]);
    for (const [k, v] of Object.entries(props)) {
      if (!required.has(k)) problemes.push(`${chemin}/${k} : non obligatoire`);
      problemes.push(...problemesStrict(v, `${chemin}/${k}`));
    }
  }
  if (s.items) problemes.push(...problemesStrict(s.items, `${chemin}[]`));
  if (Array.isArray(s.anyOf))
    s.anyOf.forEach((v, i) => {
      problemes.push(...problemesStrict(v, `${chemin}|${i}`));
    });
  return problemes;
}

describe('strictJsonSchema', () => {
  it.each([
    ['triage', TriageOutputSchema],
    ['extraction', ExtractionOutputSchema],
    ['placement', PlacementOutputSchema],
    ['juge', JugeOutputSchema],
  ])('le schéma de sortie %s est accepté en mode strict', (_etape, schema) => {
    const json = strictJsonSchema(schema as z.ZodType);
    expect(json.type).toBe('object');
    expect(problemesStrict(json)).toEqual([]);
  });

  it('décrit un champ nullable sans le rendre facultatif', () => {
    const json = strictJsonSchema(z.object({ a: z.string().nullable() }));
    expect(json).toEqual({
      type: 'object',
      properties: { a: { type: ['string', 'null'] } },
      required: ['a'],
      additionalProperties: false,
    });
  });

  it('repère un schéma qui ne serait pas strict', () => {
    const json = strictJsonSchema(z.object({ a: z.string().optional() }));
    expect(problemesStrict(json)).toEqual(['#/a : non obligatoire']);
  });
});
