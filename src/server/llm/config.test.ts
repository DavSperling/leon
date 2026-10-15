import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { type AnthropicLike, MODEL_BY_STEP } from './anthropic-llm';
import {
  createConfiguredLlm,
  describeLlmConfig,
  type LlmEnv,
  llmChoices,
  llmConfigProblems,
  missingLlmKeys,
  startConfiguredLlm,
} from './config';
import type { LlmStep } from './llm';
import type { OpenRouterCatalog } from './openrouter-models';

afterEach(() => vi.restoreAllMocks());

const Schema = z.object({ answer: z.string() });
const ask = (llm: ReturnType<typeof createConfiguredLlm>, step: LlmStep) =>
  llm.generateObject({ step, system: 's', prompt: 'p', schema: Schema, maxTokens: 10 });

function fakes() {
  const parse = vi.fn(async (_params: unknown) => ({
    stop_reason: 'end_turn',
    parsed_output: { answer: 'anthropic' },
  }));
  const anthropic = { beta: { messages: { parse } } } as unknown as AnthropicLike;
  // Aiguillé par l'URL : la liste publique des modèles, ou un appel au modèle.
  const fetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
    String(url).endsWith('/models')
      ? new Response(JSON.stringify(CATALOGUE))
      : new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'stop', message: { content: '{"answer":"openrouter"}' } }],
          }),
        ),
  );
  return { parse, anthropic, fetch: fetch as unknown as typeof globalThis.fetch, fetchMock: fetch };
}

const CATALOGUE = {
  data: [
    { id: 'openai/gpt-6-sol', supported_parameters: ['reasoning', 'structured_outputs'] },
    { id: 'mistralai/mistral-large-4-0', supported_parameters: ['structured_outputs'] },
    { id: 'openai/gpt-5.4-mini', supported_parameters: ['structured_outputs'] },
  ],
};

const catalogue = (reasoning: string[], autres: string[] = []): OpenRouterCatalog => {
  const info = (r: boolean) => ({
    reasoning: r,
    promptUsdPerToken: null,
    completionUsdPerToken: null,
  });
  return new Map([
    ...reasoning.map((id): [string, ReturnType<typeof info>] => [id, info(true)]),
    ...autres.map((id): [string, ReturnType<typeof info>] => [id, info(false)]),
  ]);
};

const AVEC_CLES: LlmEnv = { ANTHROPIC_API_KEY: 'cle-a', OPENROUTER_API_KEY: 'cle-o' };

describe('llmChoices', () => {
  it('garde les modèles Anthropic actuels quand rien n est configuré', () => {
    expect(llmChoices({})).toEqual({
      triage: { provider: 'anthropic', model: MODEL_BY_STEP.triage },
      extraction: { provider: 'anthropic', model: MODEL_BY_STEP.extraction },
      placement: { provider: 'anthropic', model: MODEL_BY_STEP.placement },
    });
  });

  it('lit le fournisseur et le modèle de chaque étape (LEON_LLM_RANGEMENT pour le rangement)', () => {
    expect(
      llmChoices({
        LEON_LLM_TRIAGE: 'openrouter:openai/gpt-5.4-mini',
        LEON_LLM_EXTRACTION: 'anthropic:claude-opus-5-5',
        LEON_LLM_RANGEMENT: 'openrouter:mistralai/mistral-large-4-0',
      }),
    ).toEqual({
      triage: { provider: 'openrouter', model: 'openai/gpt-5.4-mini' },
      extraction: { provider: 'anthropic', model: 'claude-opus-5-5' },
      placement: { provider: 'openrouter', model: 'mistralai/mistral-large-4-0' },
    });
  });
});

describe('describeLlmConfig', () => {
  it('décrit le modèle de chaque étape, sans aucune clé', () => {
    const description = describeLlmConfig({
      ...AVEC_CLES,
      LEON_LLM_EXTRACTION: 'openrouter:mistralai/mistral-large-4-0',
    });
    expect(description).toEqual({
      triage: 'anthropic:claude-haiku-5-5',
      extraction: 'openrouter:mistralai/mistral-large-4-0',
      placement: 'anthropic:claude-haiku-5-5',
    });
    expect(JSON.stringify(description)).not.toContain('cle-');
  });
});

describe('missingLlmKeys', () => {
  it('ne demande que les clés des fournisseurs utilisés', () => {
    expect(missingLlmKeys({})).toEqual(['ANTHROPIC_API_KEY']);
    expect(missingLlmKeys({ ANTHROPIC_API_KEY: 'cle-a' })).toEqual([]);
    expect(
      missingLlmKeys({
        ANTHROPIC_API_KEY: 'cle-a',
        LEON_LLM_EXTRACTION: 'openrouter:mistralai/mistral-large-4-0',
      }),
    ).toEqual(['OPENROUTER_API_KEY']);
    expect(
      missingLlmKeys({
        OPENROUTER_API_KEY: 'cle-o',
        LEON_LLM_TRIAGE: 'openrouter:openai/gpt-5.4-mini',
        LEON_LLM_EXTRACTION: 'openrouter:openai/gpt-5.4-mini',
        LEON_LLM_RANGEMENT: 'openrouter:openai/gpt-5.4-mini',
      }),
    ).toEqual([]);
  });
});

describe('createConfiguredLlm', () => {
  it('envoie chaque étape à son fournisseur, avec son modèle', async () => {
    const f = fakes();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const llm = createConfiguredLlm(
      {
        ...AVEC_CLES,
        LEON_LLM_EXTRACTION: 'openrouter:mistralai/mistral-large-4-0',
        LEON_LLM_RANGEMENT: 'anthropic:claude-opus-5-5',
      },
      { anthropic: f.anthropic, fetch: f.fetch },
    );

    expect(await ask(llm, 'triage')).toEqual({ answer: 'anthropic' });
    expect(await ask(llm, 'extraction')).toEqual({ answer: 'openrouter' });
    expect(await ask(llm, 'placement')).toEqual({ answer: 'anthropic' });

    const modeles = f.parse.mock.calls.map(([p]) => (p as { model: string }).model);
    expect(modeles).toEqual([MODEL_BY_STEP.triage, 'claude-opus-5-5']);
    const [, init] = f.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).model).toBe('mistralai/mistral-large-4-0');
  });

  it('garde le juge sur Anthropic Haiku, quelle que soit la configuration', async () => {
    const f = fakes();
    const llm = createConfiguredLlm(
      {
        ...AVEC_CLES,
        LEON_LLM_TRIAGE: 'openrouter:openai/gpt-5.4-mini',
        LEON_LLM_EXTRACTION: 'openrouter:openai/gpt-5.4-mini',
        LEON_LLM_RANGEMENT: 'openrouter:openai/gpt-5.4-mini',
      },
      { anthropic: f.anthropic, fetch: f.fetch },
    );

    expect(await ask(llm, 'juge')).toEqual({ answer: 'anthropic' });
    expect(f.parse.mock.calls[0]?.[0]).toMatchObject({ model: MODEL_BY_STEP.juge });
    expect(f.fetchMock).not.toHaveBeenCalled();
  });

  it('refuse une étape sur OpenRouter sans OPENROUTER_API_KEY', () => {
    expect(() =>
      createConfiguredLlm({
        ANTHROPIC_API_KEY: 'cle-a',
        LEON_LLM_EXTRACTION: 'openrouter:mistralai/mistral-large-4-0',
      }),
    ).toThrow(/OPENROUTER_API_KEY/);
  });

  it('refuse une étape sur Anthropic sans ANTHROPIC_API_KEY, sans citer de clé', () => {
    const error = (() => {
      try {
        createConfiguredLlm({ OPENROUTER_API_KEY: 'cle-o' });
      } catch (e) {
        return e as Error;
      }
    })();
    expect(error?.message).toMatch(/ANTHROPIC_API_KEY/);
    expect(error?.message).not.toContain('cle-o');
  });

  it('démarre tout sur OpenRouter sans clé Anthropic ; seul le juge la réclame', async () => {
    const f = fakes();
    const llm = createConfiguredLlm(
      {
        OPENROUTER_API_KEY: 'cle-o',
        LEON_LLM_TRIAGE: 'openrouter:openai/gpt-5.4-mini',
        LEON_LLM_EXTRACTION: 'openrouter:openai/gpt-5.4-mini',
        LEON_LLM_RANGEMENT: 'openrouter:openai/gpt-5.4-mini',
      },
      { fetch: f.fetch },
    );

    expect(await ask(llm, 'triage')).toEqual({ answer: 'openrouter' });
    await expect(ask(llm, 'juge')).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe('llmConfigProblems', () => {
  it('nomme les clés manquantes et les modèles Anthropic sans tarif, jamais une clé', () => {
    expect(llmConfigProblems(AVEC_CLES)).toEqual([]);
    const problemes = llmConfigProblems({
      OPENROUTER_API_KEY: 'cle-o',
      LEON_LLM_EXTRACTION: 'anthropic:claude-inconnu-9',
    });
    expect(problemes).toEqual([
      'ANTHROPIC_API_KEY absente',
      'modèle Anthropic sans tarif (coût inconnu) : claude-inconnu-9',
    ]);
    expect(problemes.join(' ')).not.toContain('cle-o');
  });

  it('refuse de créer le client avec un modèle Anthropic sans tarif', () => {
    expect(() =>
      createConfiguredLlm({ ...AVEC_CLES, LEON_LLM_TRIAGE: 'anthropic:claude-inconnu-9' }),
    ).toThrow(/claude-inconnu-9/);
  });
});

describe('effort de raisonnement OpenRouter', () => {
  const env: LlmEnv = {
    ...AVEC_CLES,
    LEON_LLM_EXTRACTION: 'openrouter:openai/gpt-6-sol',
    LEON_LLM_RANGEMENT: 'openrouter:mistralai/mistral-large-4-0',
  };
  const bodies = (f: ReturnType<typeof fakes>) =>
    f.fetchMock.mock.calls
      .filter(([url]) => !String(url).endsWith('/models'))
      .map(([, init]) => JSON.parse((init as RequestInit).body as string));

  it('n envoie l effort de l étape qu aux modèles qui le règlent', async () => {
    const f = fakes();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const llm = createConfiguredLlm(env, {
      anthropic: f.anthropic,
      fetch: f.fetch,
      catalog: catalogue(['openai/gpt-6-sol'], ['mistralai/mistral-large-4-0']),
    });

    await ask(llm, 'extraction');
    await ask(llm, 'placement');

    const [extraction, placement] = bodies(f);
    expect(extraction.reasoning).toEqual({ effort: 'medium' });
    expect(placement).not.toHaveProperty('reasoning');
  });

  it('décrit l effort des modèles OpenRouter qui raisonnent', () => {
    expect(
      describeLlmConfig(env, catalogue(['openai/gpt-6-sol'], ['mistralai/mistral-large-4-0'])),
    ).toEqual({
      triage: 'anthropic:claude-haiku-5-5',
      extraction: 'openrouter:openai/gpt-6-sol (effort medium)',
      placement: 'openrouter:mistralai/mistral-large-4-0',
    });
  });

  it('refuse un modèle OpenRouter absent du catalogue', () => {
    expect(() =>
      createConfiguredLlm(env, { fetch: fakes().fetch, catalog: catalogue(['openai/gpt-6-sol']) }),
    ).toThrow(/mistralai\/mistral-large-4-0/);
  });

  it('au démarrage, lit le catalogue public une fois et décrit la configuration', async () => {
    const f = fakes();
    vi.spyOn(console, 'info').mockImplementation(() => {});

    const { llm, description } = await startConfiguredLlm(env, {
      anthropic: f.anthropic,
      fetch: f.fetch,
    });
    await ask(llm, 'extraction');

    const modelsCalls = f.fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/models'));
    expect(modelsCalls).toHaveLength(1);
    expect(description.extraction).toBe('openrouter:openai/gpt-6-sol (effort medium)');
    expect(bodies(f)[0].reasoning).toEqual({ effort: 'medium' });
  });

  it('au démarrage, sans catalogue, prévient et n envoie aucun raisonnement', async () => {
    const f = fakes();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
      String(url).endsWith('/models')
        ? Promise.reject(new TypeError('fetch failed'))
        : f.fetch(url, init),
    ) as unknown as typeof globalThis.fetch;

    const { llm, description } = await startConfiguredLlm(env, { anthropic: f.anthropic, fetch });
    await ask(llm, 'extraction');

    expect(warn).toHaveBeenCalledOnce();
    expect(description.extraction).toBe('openrouter:openai/gpt-6-sol');
    expect(bodies(f)[0]).not.toHaveProperty('reasoning');
  });

  it('au démarrage, refuse un modèle absent du catalogue', async () => {
    const f = fakes();
    await expect(
      startConfiguredLlm(
        { ...env, LEON_LLM_TRIAGE: 'openrouter:inconnu/modele-9' },
        { anthropic: f.anthropic, fetch: f.fetch },
      ),
    ).rejects.toThrow(/inconnu\/modele-9/);
  });

  it('au démarrage, ne lit pas le catalogue sans étape sur OpenRouter', async () => {
    const f = fakes();
    await startConfiguredLlm(AVEC_CLES, { anthropic: f.anthropic, fetch: f.fetch });
    expect(f.fetchMock).not.toHaveBeenCalled();
  });
});
