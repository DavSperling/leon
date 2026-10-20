import { describe, expect, it } from 'vitest';
import { EmbedderError } from './embedder';

describe('EmbedderError', () => {
  it('est une erreur nommée, au message fixe', () => {
    const error = new EmbedderError('Fournisseur de vecteurs indisponible');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('EmbedderError');
    expect(error.message).toBe('Fournisseur de vecteurs indisponible');
  });
});
