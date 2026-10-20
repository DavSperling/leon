import { EMBEDDING_DIMS, type Embedder, EmbedderError } from './embedder';

// Fournisseur de vecteurs passant par OpenRouter (API compatible OpenAI) : un seul compte pour comparer les
// candidats du plan (voyageai/voyage-4, mistralai/mistral-embed-2312, baai/bge-m3) et d'autres. Le modèle se
// règle par LEON_EMBEDDINGS_MODEL ; il doit rendre EMBEDDING_DIMS valeurs, sinon chaque appel échoue.

const URL = 'https://openrouter.ai/api/v1/embeddings';
const BATCH = 64;
const TIMEOUT_MS = 30_000;

type Response = { data?: { index: number; embedding: number[] }[] };

export function createOpenRouterEmbedder(
  config: { apiKey: string; model: string },
  fetchImpl: typeof fetch = fetch,
): Embedder {
  async function embedBatch(texts: string[]): Promise<number[][]> {
    let res: globalThis.Response;
    try {
      res = await fetchImpl(URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: config.model, input: texts }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new EmbedderError('OpenRouter injoignable');
    }
    if (!res.ok) throw new EmbedderError(`OpenRouter : réponse ${res.status}`);
    const body = (await res.json().catch(() => ({}))) as Response;
    const data = [...(body.data ?? [])].sort((a, b) => a.index - b.index);
    if (data.length !== texts.length)
      throw new EmbedderError('OpenRouter : nombre de vecteurs inattendu');
    return data.map(({ embedding }) => {
      if (embedding.length !== EMBEDDING_DIMS) {
        throw new EmbedderError(
          `OpenRouter : vecteurs de ${embedding.length} valeurs, ${EMBEDDING_DIMS} attendues`,
        );
      }
      return embedding;
    });
  }

  return {
    model: `openrouter:${config.model}`,
    async embed(texts) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += BATCH)
        out.push(...(await embedBatch(texts.slice(i, i + BATCH))));
      return out;
    },
  };
}
