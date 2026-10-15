import { describe, expect, it, vi } from 'vitest';
import { fetchOpenRouterCatalog, OPENROUTER_MODELS_URL } from './openrouter-models';

const CATALOGUE = {
  data: [
    {
      id: 'openai/gpt-6-sol',
      supported_parameters: ['reasoning', 'structured_outputs', 'response_format'],
      pricing: { prompt: '0.000004', completion: '0.00002' },
    },
    {
      id: 'mistralai/mistral-large-4-0',
      supported_parameters: ['structured_outputs', 'response_format'],
      pricing: { prompt: '0.00000068', completion: '0.00000209' },
    },
    { id: 'sans/parametres' },
  ],
};

describe('fetchOpenRouterCatalog', () => {
  it('lit le raisonnement et les prix de chaque modèle, sur la liste publique', async () => {
    const fetch = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify(CATALOGUE)),
    );

    const catalogue = await fetchOpenRouterCatalog(fetch as unknown as typeof globalThis.fetch);

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(OPENROUTER_MODELS_URL);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).toBeUndefined(); // liste publique : jamais de clé
    expect(catalogue?.get('openai/gpt-6-sol')).toEqual({
      reasoning: true,
      promptUsdPerToken: 0.000004,
      completionUsdPerToken: 0.00002,
    });
    expect(catalogue?.get('mistralai/mistral-large-4-0')?.reasoning).toBe(false);
    expect(catalogue?.get('sans/parametres')).toEqual({
      reasoning: false,
      promptUsdPerToken: null,
      completionUsdPerToken: null,
    });
  });

  it.each([
    ['le réseau échoue', async () => Promise.reject(new TypeError('fetch failed'))],
    ['le statut est une erreur', async () => new Response('{}', { status: 503 })],
    ['la réponse est illisible', async () => new Response('pas du JSON')],
  ])('renvoie null quand %s', async (_cas, reply) => {
    const fetch = vi.fn(reply) as unknown as typeof globalThis.fetch;
    expect(await fetchOpenRouterCatalog(fetch)).toBeNull();
  });
});
