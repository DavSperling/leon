import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { type AnthropicLike, MODEL_BY_STEP } from './anthropic-llm';
import {
  createConfiguredLlm,
  describeLlmConfig,
  type LlmEnv,
  llmChoices,
  missingLlmKeys,
} from './config';
import type { LlmStep } from './llm';

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
  const fetch = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { content: '{"answer":"openrouter"}' } }],
        }),
      ),
  );
  return { parse, anthropic, fetch: fetch as unknown as typeof globalThis.fetch, fetchMock: fetch };
}

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
