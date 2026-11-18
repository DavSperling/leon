import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEST_ENV } from '@/test/test-env';
import { parseEnv } from '../env';
import { getLlm, orAnthropic } from './get-llm';
import { LlmError } from './llm';

// L'écriture dans appels_modele : sans base dans ces tests.
vi.mock('../db/client', () => ({ pool: { query: vi.fn(() => Promise.resolve()) } }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const request = {
  step: 'reponse' as const,
  system: 'Système',
  messages: [{ role: 'user' as const, content: 'Où en est Acme ?' }],
  maxTokens: 100,
};

async function answer(env: ReturnType<typeof parseEnv>): Promise<string> {
  const llm = getLlm(env);
  if (!llm) throw new Error('aucun modèle');
  let text = '';
  for await (const delta of llm.streamText(request)) text += delta;
  return text;
}

describe('getLlm', () => {
  it('rend null sans clé Anthropic ni LEON_LLM : Leon garde et indexe, mais ne répond pas', () => {
    expect(getLlm(parseEnv(TEST_ENV))).toBeNull();
    expect(getLlm(parseEnv({ ...TEST_ENV, ANTHROPIC_API_KEY: '', LEON_LLM: '' }))).toBeNull();
  });

  it('rend le client Anthropic quand la clé est réglée', () => {
    const llm = getLlm(parseEnv({ ...TEST_ENV, ANTHROPIC_API_KEY: 'cle-de-test' }));

    expect(llm).not.toBeNull();
    expect(typeof llm?.streamText).toBe('function');
    expect(typeof llm?.runAgent).toBe('function');
  });

  it('rend le faux modèle de démonstration avec LEON_LLM=factice, sans clé', async () => {
    const text = await answer(parseEnv({ ...TEST_ENV, LEON_LLM: 'factice' }));

    expect(text).toContain('modèle factice');
    expect(text).toContain('[1]');
  });

  it('préfère le faux modèle à la clé : une démo ne dépense rien', async () => {
    const text = await answer(
      parseEnv({ ...TEST_ENV, LEON_LLM: 'factice', ANTHROPIC_API_KEY: 'cle-de-test' }),
    );

    expect(text).toContain('modèle factice');
  });

  // Les deux clients prennent le fetch global à leur création : un faux fetch dit à qui chaque appel est parti. Il
  // répond 400 (le SDK d'Anthropic ne réessaie pas), chaque appel échoue : seule l'adresse compte ici.
  it('envoie chaque étape au fournisseur de son modèle quand les deux clés sont là', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Response.json({ type: 'error', error: { type: 'invalid_request_error' } }, { status: 400 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const llm = getLlm(
      parseEnv({
        ...TEST_ENV,
        ANTHROPIC_API_KEY: 'cle-de-test',
        OPENROUTER_API_KEY: 'cle-de-test',
        LEON_MODEL_REPONSE: 'openai/gpt-6-luna',
      }),
    );
    const urlOf = async (step: 'reponse' | 'point') => {
      fetchMock.mockClear();
      const stream = llm?.streamText({ ...request, step }) ?? [];
      await expect(
        (async () => {
          for await (const _ of stream);
        })(),
      ).rejects.toBeInstanceOf(LlmError);
      return String(fetchMock.mock.calls[0]?.[0]);
    };

    expect(await urlOf('reponse')).toBe('https://openrouter.ai/api/v1/chat/completions');
    // L'appel OpenRouter a échoué avant tout texte : il est refait chez Anthropic.
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toMatch(/^https:\/\/api\.anthropic\.com\//);
    expect(await urlOf('point')).toMatch(/^https:\/\/api\.anthropic\.com\//);
  });

  it('refuse le faux modèle en production : l’environnement ne se charge pas', () => {
    expect(() =>
      getLlm(parseEnv({ ...TEST_ENV, LEON_LLM: 'factice', NODE_ENV: 'production' })),
    ).toThrow(/LEON_LLM.*production/s);
  });
});

describe('orAnthropic', () => {
  async function* chunks(items: string[], error?: Error) {
    for (const item of items) yield item;
    if (error) throw error;
  }
  const read = async (stream: AsyncIterable<string>) => {
    const out: string[] = [];
    for await (const item of stream) out.push(item);
    return out;
  };

  it('refait chez Anthropic un appel qui échoue avant tout morceau', async () => {
    const stream = orAnthropic(
      chunks([], new LlmError('appel au modèle impossible')),
      () => chunks(['repli']),
      undefined,
    );
    expect(await read(stream)).toEqual(['repli']);
  });

  it('laisse passer l’erreur après un premier morceau, une interruption voulue, ou une erreur qui n’est pas du modèle', async () => {
    const fallback = vi.fn(() => chunks(['repli']));
    await expect(
      read(orAnthropic(chunks(['début'], new LlmError('réponse tronquée')), fallback, undefined)),
    ).rejects.toThrow('réponse tronquée');
    const aborted = AbortSignal.abort();
    await expect(
      read(orAnthropic(chunks([], new LlmError('appel interrompu')), fallback, aborted)),
    ).rejects.toThrow('appel interrompu');
    await expect(
      read(orAnthropic(chunks([], new TypeError('bogue')), fallback, undefined)),
    ).rejects.toThrow('bogue');
    expect(fallback).not.toHaveBeenCalled();
  });
});
