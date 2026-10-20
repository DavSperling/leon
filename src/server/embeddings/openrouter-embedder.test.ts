import { describe, expect, it } from 'vitest';
import { TEST_ENV } from '@/test/test-env';
import { parseEnv } from '../env';
import { EMBEDDING_DIMS, EmbedderError, EmbedderRefusal } from './embedder';
import { createOpenRouterEmbedder } from './openrouter-embedder';
import { getEmbedder } from './registry';

const vector = (x: number) => new Array<number>(EMBEDDING_DIMS).fill(x);

function fakeFetch(respond: (body: { model: string; input: string[] }) => Response) {
  const calls: { model: string; input: string[]; auth: string | null }[] = [];
  const impl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ ...body, auth: new Headers(init.headers).get('authorization') });
    return respond(body);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const ok = (input: string[]) =>
  Response.json({ data: input.map((_, i) => ({ index: i, embedding: vector(i) })).reverse() });

describe('createOpenRouterEmbedder', () => {
  it('rend un vecteur par texte, dans l’ordre, par lots de 64', async () => {
    const { impl, calls } = fakeFetch((b) => ok(b.input));
    const embedder = createOpenRouterEmbedder({ apiKey: 'cle', model: 'baai/bge-m3' }, impl);
    const texts = Array.from({ length: 70 }, (_, i) => `t${i}`);
    const out = await embedder.embed(texts, 'document');
    expect(out).toHaveLength(70);
    expect(out[1]?.[0]).toBe(1);
    expect(calls.map((c) => c.input.length)).toEqual([64, 6]);
    expect(calls[0]).toMatchObject({ model: 'baai/bge-m3', auth: 'Bearer cle' });
    expect(embedder.model).toBe('openrouter:baai/bge-m3');
  });

  it('refuse une mauvaise dimension et une erreur du service, sans citer sa réponse', async () => {
    const short = fakeFetch(() => Response.json({ data: [{ index: 0, embedding: [1, 2] }] }));
    await expect(
      createOpenRouterEmbedder({ apiKey: 'k', model: 'm' }, short.impl).embed(['a'], 'requete'),
    ).rejects.toThrow(EmbedderError);
    const down = fakeFetch(() => new Response('texte secret', { status: 500 }));
    await expect(
      createOpenRouterEmbedder({ apiKey: 'k', model: 'm' }, down.impl).embed(['a'], 'requete'),
    ).rejects.toThrow('OpenRouter : réponse 500');
  });

  // Audit 2 n° 9 a : un refus des textes se redemande texte par texte ; une panne, non.
  it('distingue un refus des textes (400, 413, 422) d’une panne du service', async () => {
    const embedWith = (status: number) =>
      createOpenRouterEmbedder(
        { apiKey: 'k', model: 'm' },
        fakeFetch(() => new Response('', { status })).impl,
      ).embed(['a'], 'document');
    for (const status of [400, 413, 422]) {
      await expect(embedWith(status)).rejects.toBeInstanceOf(EmbedderRefusal);
    }
    for (const status of [401, 429, 500, 503]) {
      await expect(embedWith(status)).rejects.not.toBeInstanceOf(EmbedderRefusal);
    }
  });
});

describe('LEON_EMBEDDINGS=openrouter', () => {
  it('exige la clé et le modèle', () => {
    expect(() => parseEnv({ ...TEST_ENV, LEON_EMBEDDINGS: 'openrouter' })).toThrow(
      /OPENROUTER_API_KEY|LEON_EMBEDDINGS_MODEL/,
    );
  });

  it('rend le fournisseur OpenRouter avec son modèle', () => {
    const env = parseEnv({
      ...TEST_ENV,
      LEON_EMBEDDINGS: 'openrouter',
      OPENROUTER_API_KEY: 'cle',
      LEON_EMBEDDINGS_MODEL: 'voyageai/voyage-4',
    });
    expect(getEmbedder(env)?.model).toBe('openrouter:voyageai/voyage-4');
  });
});
