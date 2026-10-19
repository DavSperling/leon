import type { Env } from '../env';
import type { Embedder } from './embedder';
import { createFakeEmbedder } from './fake-embedder';

// Les fournisseurs que LEON_EMBEDDINGS peut nommer (C3). Le choix du fournisseur réel est à faire par Amos et
// David après la comparaison sur le jeu d'essai : rien ici n'en fixe un par défaut.
export const EMBEDDER_IDS = ['factice', 'voyage', 'mistral', 'bge-m3'] as const;
export type EmbedderId = (typeof EMBEDDER_IDS)[number];

// LEON_EMBEDDINGS absent : pas de vecteurs, la recherche se fait par le texte seul.
export function getEmbedder(env: Env): Embedder | null {
  const id = env.LEON_EMBEDDINGS;
  if (id === undefined) return null;
  if (id === 'factice') return createFakeEmbedder();
  // Les adaptateurs de Voyage, de Mistral et de bge-m3 arrivent avec la comparaison des candidats (T30).
  throw new Error(`LEON_EMBEDDINGS=${id} : fournisseur non livré`);
}
