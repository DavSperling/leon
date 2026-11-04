import { describe, expect, it } from 'vitest';
import { tabOf } from './settings-tabs';

// Les ancres de Réglages ouvrent l'onglet qui contient la section : sans cela, « Ce qui part » (onboarding, S13) ouvrirait
// le premier onglet et ne trouverait pas #ordinateurs.
describe('tabOf', () => {
  it('ouvre Intégrations pour #ordinateurs, #jetons, #claude-code et #extension', () => {
    for (const anchor of ['ordinateurs', 'jetons', 'claude-code', 'extension']) {
      expect(tabOf(`#${anchor}`), anchor).toBe('integrations');
    }
  });

  it('garde les autres ancres : un onglet par son nom, #membres dans Équipe, le reste rien', () => {
    expect(tabOf('#securite')).toBe('securite');
    expect(tabOf('#membres')).toBe('equipe');
    expect(tabOf('#inconnue')).toBeUndefined();
    expect(tabOf('')).toBeUndefined();
  });
});
