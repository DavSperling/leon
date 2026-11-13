import { describe, expect, it } from 'vitest';
import { tabOf } from './settings-tabs';

// Les ancres de Réglages ouvrent le groupe qui contient la section : sans cela, « Ce qui part » (onboarding, S13) ouvrirait
// le premier groupe et ne trouverait pas #ordinateurs.
describe('tabOf', () => {
  it('ouvre Assistants (id « integrations ») pour #ordinateurs, #jetons, #assistants et #extension', () => {
    for (const anchor of ['ordinateurs', 'jetons', 'assistants', 'extension']) {
      expect(tabOf(`#${anchor}`), anchor).toBe('integrations');
    }
  });

  // La section « Brancher Claude Code » n'existe plus : son ancre ne mène nulle part.
  it('ne connaît plus #claude-code', () => {
    expect(tabOf('#claude-code')).toBeUndefined();
  });

  // Connexions mène à /reglages#equipe pour les dépôts d'équipe : le groupe Espace de travail garde l'id « equipe ».
  it('ouvre Espace de travail pour #equipe, #sso, #managers et #depots-equipe', () => {
    for (const anchor of ['equipe', 'sso', 'managers', 'depots-equipe']) {
      expect(tabOf(`#${anchor}`), anchor).toBe('equipe');
    }
  });

  // Les ancres du prototype (settings.html#security…) ouvrent le même groupe que les nôtres.
  it('accepte #profile, #security, #assistants et #workspace', () => {
    expect(tabOf('#profile')).toBe('profil');
    expect(tabOf('#security')).toBe('securite');
    expect(tabOf('#assistants')).toBe('integrations');
    expect(tabOf('#workspace')).toBe('equipe');
  });

  it('garde les autres ancres : un groupe par son nom, le reste rien', () => {
    expect(tabOf('#profil')).toBe('profil');
    expect(tabOf('#securite')).toBe('securite');
    expect(tabOf('#inconnue')).toBeUndefined();
    expect(tabOf('')).toBeUndefined();
  });
});
