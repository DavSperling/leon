import { describe, expect, it } from 'vitest';
import { EMBEDDING_DIMS } from './embedder';
import { createFakeEmbedder } from './fake-embedder';

const norm = (vector: number[]): number => Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));

const cosine = (a: number[], b: number[]): number =>
  a.reduce((sum, x, i) => sum + x * (b[i] as number), 0) / (norm(a) * norm(b));

describe('createFakeEmbedder', () => {
  const embedder = createFakeEmbedder();

  it('porte le nom de modèle factice-1024', () => {
    expect(embedder.model).toBe('factice-1024');
  });

  it('rend, pour deux textes identiques, deux vecteurs identiques de 1 024 valeurs et de norme 1', async () => {
    const [a, b] = await embedder.embed(['contrat OVH', 'contrat OVH'], 'document');
    expect(a).toHaveLength(EMBEDDING_DIMS);
    expect(EMBEDDING_DIMS).toBe(1024);
    expect(b).toEqual(a);
    expect(Math.abs(norm(a as number[]) - 1)).toBeLessThan(1e-6);
  });

  it('rend un vecteur par texte, dans l’ordre', async () => {
    const [seul] = await embedder.embed(['facture de mars'], 'document');
    const vecteurs = await embedder.embed(['contrat OVH', 'facture de mars'], 'document');
    expect(vecteurs).toHaveLength(2);
    expect(vecteurs[1]).toEqual(seul);
    expect(vecteurs[0]).not.toEqual(seul);
  });

  it('ne rend rien pour une liste vide, sans erreur', async () => {
    expect(await embedder.embed([], 'document')).toEqual([]);
  });

  it('rend les mêmes vecteurs d’une instance à l’autre', async () => {
    const autre = createFakeEmbedder();
    expect(await autre.embed(['contrat OVH renouvelé'], 'document')).toEqual(
      await embedder.embed(['contrat OVH renouvelé'], 'document'),
    );
  });

  it('place un texte proche d’un autre plus près que le texte sans rapport', async () => {
    const [base, proche, loin] = await embedder.embed(
      ['contrat OVH renouvelé', 'renouvellement du contrat OVH', 'recette de crêpes'],
      'document',
    );
    expect(cosine(base as number[], proche as number[])).toBeGreaterThan(
      cosine(base as number[], loin as number[]),
    );
  });

  it('ignore la casse et les accents', async () => {
    const [a, b] = await embedder.embed(
      ['Contrat OVH renouvelé', 'contrat ovh renouvele'],
      'document',
    );
    expect(b).toEqual(a);
  });

  it('rend le même vecteur pour un document et pour une requête', async () => {
    const [document] = await embedder.embed(['contrat OVH'], 'document');
    const [requete] = await embedder.embed(['contrat OVH'], 'requete');
    expect(requete).toEqual(document);
  });

  it('rend un vecteur de norme 1 même pour un texte sans mot', async () => {
    const [vide, ponctuation] = await embedder.embed(['', ' … !? '], 'requete');
    expect(Math.abs(norm(vide as number[]) - 1)).toBeLessThan(1e-6);
    expect(Math.abs(norm(ponctuation as number[]) - 1)).toBeLessThan(1e-6);
  });

  it('rend un vecteur de norme 1 même quand deux mots s’annulent dans la même case', async () => {
    // « mot9 » et « mot180 » tombent dans la même case avec des signes opposés (empreinte FNV-1a).
    const [vecteur] = await embedder.embed(['mot9 mot180'], 'document');
    expect(Math.abs(norm(vecteur as number[]) - 1)).toBeLessThan(1e-6);
  });

  it('accepte plus de 64 textes en un appel (le découpage en lots est affaire de fournisseur)', async () => {
    const textes = Array.from({ length: 200 }, (_, i) => `texte numéro ${i}`);
    expect(await embedder.embed(textes, 'document')).toHaveLength(200);
  });
});
