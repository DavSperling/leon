import { describe, expect, it } from 'vitest';
import { readGitCommit } from './version';

describe('readGitCommit', () => {
  it('renvoie le commit courant du dépôt', () => {
    expect(readGitCommit()).toMatch(/^[0-9a-f]{40}$/);
  });
});
