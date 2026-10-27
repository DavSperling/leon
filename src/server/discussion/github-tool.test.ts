import { describe, expect, it } from 'vitest';
import { isBranchName } from './github-tool';

describe('isBranchName', () => {
  it('accepte les noms de branche courants', () => {
    for (const name of ['main', 'feature/connexion', 'fix-12', 'v1.2', 'amos/github_outil']) {
      expect(isBranchName(name), name).toBe(true);
    }
  });

  it('refuse ce que git refuse, ou qui changerait l’adresse appelée', () => {
    const bad = [
      '',
      '../main',
      'a..b',
      'a//b',
      '/a',
      'a/',
      '.a',
      'a.',
      '-a',
      'a.lock',
      'a/.b',
      'a b',
    ];
    for (const name of [...bad, 'a?b', 'a#b', 'a~1', 'a^', 'a:b', 'a\\b', 'x'.repeat(201)]) {
      expect(isBranchName(name), name).toBe(false);
    }
  });
});
