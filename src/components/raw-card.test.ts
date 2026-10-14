import { describe, expect, it } from 'vitest';
import { estimateTokens } from './raw-card';

describe('estimateTokens', () => {
  it('compte un jeton pour quatre caractères, arrondi au-dessus', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});
