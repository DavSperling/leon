import { AnthropicError, APIError } from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  type AnthropicLike,
  createAnthropicLlm,
  EFFORT_BY_STEP,
  MODEL_BY_STEP,
} from './anthropic-llm';
import { LlmError, type LlmRequest, type LlmStep } from './llm';

const Schema = z.object({ answer: z.string() });

function request(step: LlmStep, prompt = 'Question ordinaire'): LlmRequest<{ answer: string }> {
  return { step, system: 'Consignes du système', prompt, schema: Schema, maxTokens: 1234 };
}

function setup(reply: () => unknown) {
  const parse = vi.fn(async (_params: unknown) => reply());
  const client = { beta: { messages: { parse } } } as unknown as AnthropicLike;
  return { parse, llm: createAnthropicLlm({ client }) };
}

const ok = { stop_reason: 'end_turn', parsed_output: { answer: 'oui' } };

describe('createAnthropicLlm', () => {
  it.each(['triage', 'extraction', 'placement'] as const)(
    'appelle le modèle, l effort et la limite de l étape %s',
    async (step) => {
      const { llm, parse } = setup(() => ok);

      const result = await llm.generateObject(request(step));

      expect(result).toEqual({ answer: 'oui' });
      expect(parse).toHaveBeenCalledOnce();
      const [params] = parse.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(params).toMatchObject({
        model: MODEL_BY_STEP[step],
        max_tokens: 1234,
        system: 'Consignes du système',
        messages: [{ role: 'user', content: 'Question ordinaire' }],
        output_config: { effort: EFFORT_BY_STEP[step], format: { type: 'json_schema' } },
      });
      expect(params).not.toHaveProperty('thinking');
    },
  );

  it('utilise les bons modèles et efforts', () => {
    expect(MODEL_BY_STEP).toEqual({
      triage: 'claude-haiku-5-5',
      extraction: 'claude-sonnet-5-5',
      placement: 'claude-opus-5-5',
    });
    expect(EFFORT_BY_STEP).toEqual({ triage: 'low', extraction: 'medium', placement: 'high' });
  });

  it.each(['extraction', 'placement'] as const)(
    'active le repli serveur des refus pour %s',
    async (step) => {
      const { llm, parse } = setup(() => ok);

      await llm.generateObject(request(step));

      expect(parse.mock.calls[0]?.[0]).toMatchObject({
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
    },
  );

  it('n active pas le repli pour le triage', async () => {
    const { llm, parse } = setup(() => ok);

    await llm.generateObject(request('triage'));

    const [params] = parse.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(params).not.toHaveProperty('betas');
    expect(params).not.toHaveProperty('fallbacks');
  });

  it('ne met pas de cache_control dans le prompt système', async () => {
    const { llm, parse } = setup(() => ok);

    await llm.generateObject(request('triage'));

    expect(JSON.stringify(parse.mock.calls[0]?.[0])).not.toContain('cache_control');
  });

  it.each([
    ['refusal', 'refus du modèle'],
    ['max_tokens', 'réponse tronquée'],
    ['model_context_window_exceeded', 'réponse tronquée'],
  ])('transforme le stop_reason %s en LlmError « %s »', async (stopReason, message) => {
    const { llm } = setup(() => ({ stop_reason: stopReason, parsed_output: null }));

    const error = await llm.generateObject(request('triage')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).message).toBe(message);
  });

  it('transforme une sortie absente en LlmError', async () => {
    const { llm } = setup(() => ({ stop_reason: 'end_turn', parsed_output: null }));

    await expect(llm.generateObject(request('triage'))).rejects.toThrow(
      new LlmError('sortie non conforme'),
    );
  });

  it('remplace l erreur d analyse du SDK par un message fixe qui ne cite pas la sortie', async () => {
    const parse = vi
      .fn()
      .mockRejectedValue(
        new AnthropicError(
          'Failed to parse structured output: SyntaxError … "zanzibar confidentiel"',
        ),
      );
    const llm = createAnthropicLlm({
      client: { beta: { messages: { parse } } } as unknown as AnthropicLike,
    });

    const error = await llm.generateObject(request('triage')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).message).toBe('sortie non conforme');
    expect((error as LlmError).message).not.toContain('zanzibar');
  });

  it.each([429, 500])(
    'relance telle quelle une APIError %i (pg-boss reprendra)',
    async (status) => {
      const failure = new APIError(status, { type: 'error' }, 'Surcharge', new Headers());
      const parse = vi.fn().mockRejectedValue(failure);
      const llm = createAnthropicLlm({
        client: { beta: { messages: { parse } } } as unknown as AnthropicLike,
      });

      await expect(llm.generateObject(request('triage'))).rejects.toBe(failure);
    },
  );

  it('ne cite jamais le prompt dans les messages d erreur', async () => {
    const secret = 'zanzibar-dans-le-prompt';
    const replies = [
      { stop_reason: 'refusal', parsed_output: null },
      { stop_reason: 'max_tokens', parsed_output: null },
      { stop_reason: 'end_turn', parsed_output: null },
    ];
    for (const reply of replies) {
      const { llm } = setup(() => reply);
      const error = await llm.generateObject(request('triage', secret)).catch((e: unknown) => e);
      expect((error as Error).message).not.toContain(secret);
    }
  });
});
