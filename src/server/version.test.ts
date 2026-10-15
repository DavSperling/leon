import { describe, expect, it } from 'vitest';
import { readGitCommit, startCommitFrom } from './version';

describe('readGitCommit', () => {
  it('renvoie le commit courant du dépôt', () => {
    expect(readGitCommit()).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('startCommitFrom', () => {
  it('renvoie le commit tel quel quand src est propre', () => {
    expect(startCommitFrom('a'.repeat(40), false)).toBe('a'.repeat(40));
  });

  it('suffixe -dirty quand src a des modifications non commitées', () => {
    expect(startCommitFrom('a'.repeat(40), true)).toBe(`${'a'.repeat(40)}-dirty`);
  });

  it('renvoie null sans suffixe quand le commit est inconnu', () => {
    expect(startCommitFrom(null, true)).toBeNull();
  });
});
