// Interface des fournisseurs de vecteurs (C3). Même esprit que l'interface `Llm` : le code de la recherche
// ne connaît que ce contrat, le fournisseur se choisit par réglage (LEON_EMBEDDINGS, voir registry.ts).
// Aucun fournisseur n'est choisi par défaut : sans réglage, la recherche se fait par le texte seul.

// Dimension fixe des vecteurs stockés (`halfvec(1024)` dans passage_vectors). Un fournisseur d'une autre
// dimension demanderait une migration.
export const EMBEDDING_DIMS = 1024;

// Les fournisseurs que LEON_EMBEDDINGS peut nommer. La liste vit ici, feuille sans dépendance, pour que env.ts
// l'importe sans tirer le registre ni les fournisseurs (un fournisseur qui importerait env fermerait un cycle).
// Le choix du fournisseur réel est à faire par Amos et David après la comparaison sur le jeu d'essai : rien
// n'en fixe un par défaut.
export const EMBEDDER_IDS = ['factice', 'voyage', 'mistral', 'bge-m3', 'openrouter'] as const;
export type EmbedderId = (typeof EMBEDDER_IDS)[number];

// `document` : le texte d'un passage à indexer ; `requete` : ce que cherche l'utilisateur. Certains
// fournisseurs fabriquent des vecteurs différents pour les deux.
export type EmbedKind = 'document' | 'requete';

export interface Embedder {
  // Nom du modèle, enregistré avec chaque vecteur : 'factice-1024', 'voyage-…', 'mistral-embed', 'bge-m3'.
  readonly model: string;
  // Un vecteur de EMBEDDING_DIMS valeurs par texte, dans l'ordre des textes. L'appelant peut passer autant
  // de textes qu'il veut : le découpage en lots (64 textes au plus par appel au fournisseur) est l'affaire
  // de chaque fournisseur.
  embed(texts: string[], kind: EmbedKind): Promise<number[][]>;
}

// Message fixe : jamais celui du fournisseur, qui peut citer le texte envoyé ou la clé.
export class EmbedderError extends Error {
  override name = 'EmbedderError';
}
