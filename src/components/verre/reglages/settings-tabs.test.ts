import { describe, expect, it } from 'vitest';
import { tabOf } from './settings-tabs';

// Les ancres de Réglages ouvrent l'onglet qui contient la section : sans cela, « Ce qui part » (onboarding, S13) ouvrirait
// le premier onglet et ne trouverait pas #ordinateurs.
describe('tabOf', () => {
  it('ouvre Intégrations pour #ordinateurs, #jetons, #assistants et #extension', () => {
    for (const anchor of ['ordinateurs', 'jetons', 'assistants', 'extension']) {
      expect(tabOf(`#${anchor}`), anchor).toBe('integrations');
    }
  });

  // La section « Brancher Claude Code » n'existe plus : son ancre ne mène nulle part.
  it('ne connaît plus #claude-code', () => {
    expect(tabOf('#claude-code')).toBeUndefined();
  });

  // T55 : la section Mémoire est le cinquième onglet ; /connexion?retour=memoire y ramène par #memoire.
  it('ouvre Mémoire pour #memoire', () => {
    expect(tabOf('#memoire')).toBe('memoire');
  });

  it('garde les autres ancres : un onglet par son nom, #membres dans Équipe, le reste rien', () => {
    expect(tabOf('#securite')).toBe('securite');
    expect(tabOf('#membres')).toBe('equipe');
    expect(tabOf('#inconnue')).toBeUndefined();
    expect(tabOf('')).toBeUndefined();
  });
});
