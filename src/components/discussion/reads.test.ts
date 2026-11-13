import { describe, expect, it } from 'vitest';
import { readableProviders } from './reads';

const base = { status: 'active', isCreator: false, partage: null } as const;

describe('readableProviders', () => {
  it("garde les outils de la personne et ceux que toute l'équipe voit, une fois chacun", () => {
    expect(
      readableProviders(
        [
          { ...base, provider: 'gmail', isCreator: true },
          { ...base, provider: 'github', partage: 'equipe' },
          { ...base, provider: 'github', partage: 'equipe' },
          { ...base, provider: 'notion' },
        ],
        new Set(['gmail']),
      ),
    ).toEqual(['gmail', 'github', 'notion']);
  });

  it("écarte ce qu'un autre garde pour lui, un groupe, une pause et une erreur", () => {
    expect(
      readableProviders(
        [
          { ...base, provider: 'gmail' },
          { ...base, provider: 'slack', partage: 'moi' },
          { ...base, provider: 'drive', partage: '7b0f6c0e-0000-4000-8000-000000000001' },
          { ...base, provider: 'linear', status: 'error', isCreator: true },
          { ...base, provider: 'notion', status: 'paused', partage: 'equipe' },
        ],
        new Set(['gmail']),
      ),
    ).toEqual([]);
  });
});
