import type { Env } from '../env';
import type { Embedder } from './embedder';
import { createFakeEmbedder } from './fake-embedder';

// La liste des fournisseurs vit dans embedder.ts (voir là) ; le registre la ré-exporte. Un fournisseur reçoit
// son réglage en argument de getEmbedder et n'importe jamais env.
export { EMBEDDER_IDS, type EmbedderId } from './embedder';

// LEON_EMBEDDINGS absent : pas de vecteurs, la recherche se fait par le texte seul.
export function getEmbedder(env: Env): Embedder | null {
  const id = env.LEON_EMBEDDINGS;
  if (id === undefined) return null;
  if (id === 'factice') return createFakeEmbedder();
  // Les adaptateurs de Voyage, de Mistral et de bge-m3 arrivent avec la comparaison des candidats (T30).
  throw new Error(`LEON_EMBEDDINGS=${id} : fournisseur non livré`);
}
