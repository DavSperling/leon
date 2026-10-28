import { describe, expect, it } from 'vitest';
import { isBranchName, isRepoPath } from './github-live';

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

describe('isRepoPath', () => {
  it('accepte un chemin depuis la racine du dépôt', () => {
    for (const path of ['README.md', 'src/app.ts', '.github/workflows/ci.yml', 'docs/a b/é.md']) {
      expect(isRepoPath(path), path).toBe(true);
    }
  });

  it('refuse ce qui changerait la route appelée, ou qui n’est pas un chemin', () => {
    for (const path of [
      '',
      '/a',
      'a/',
      'a//b',
      './a',
      'a/./b',
      '../a',
      'a/..',
      'a\nb',
      'x'.repeat(501),
    ]) {
      expect(isRepoPath(path), path).toBe(false);
    }
    expect(isRepoPath(null)).toBe(false);
    expect(isRepoPath(undefined)).toBe(false);
  });
});
