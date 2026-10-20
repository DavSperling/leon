import { describe, expect, it } from 'vitest';
import { TEST_ENV } from '@/test/test-env';
import { parseEnv } from '../env';
import * as embedder from './embedder';
import { EMBEDDER_IDS, getEmbedder } from './registry';

describe('getEmbedder', () => {
  it('liste les quatre fournisseurs prévus', () => {
    expect([...EMBEDDER_IDS]).toEqual(['factice', 'voyage', 'mistral', 'bge-m3', 'openrouter']);
  });

  it('ré-exporte la liste de embedder.ts, que env.ts importe sans passer par le registre', () => {
    expect(EMBEDDER_IDS).toBe(embedder.EMBEDDER_IDS);
  });

  it('rend null quand LEON_EMBEDDINGS est absent : recherche par le texte seul', () => {
    expect(getEmbedder(parseEnv(TEST_ENV))).toBeNull();
  });

  it('rend null quand LEON_EMBEDDINGS est vide', () => {
    expect(getEmbedder(parseEnv({ ...TEST_ENV, LEON_EMBEDDINGS: '' }))).toBeNull();
  });

  it('rend le fournisseur factice pour « factice »', () => {
    const embedder = getEmbedder(parseEnv({ ...TEST_ENV, LEON_EMBEDDINGS: 'factice' }));
    expect(embedder?.model).toBe('factice-1024');
  });

  it.each([
    ['voyage', { VOYAGE_API_KEY: 'cle-de-test' }],
    ['mistral', { MISTRAL_API_KEY: 'cle-de-test' }],
    ['bge-m3', { LEON_BGE_URL: 'http://127.0.0.1:8080' }],
  ])(
    'lève « fournisseur non livré » pour %s tant que son adaptateur n’existe pas',
    (id, reglage) => {
      const env = parseEnv({ ...TEST_ENV, LEON_EMBEDDINGS: id, ...reglage });
      expect(() => getEmbedder(env)).toThrow(/fournisseur non livré/);
    },
  );
});
