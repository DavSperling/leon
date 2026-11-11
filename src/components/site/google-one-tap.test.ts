import { describe, expect, it, vi } from 'vitest';
import { offersOneTap } from './google-one-tap';

// L'action ouvre Better Auth : seule la règle d'affichage se teste ici.
vi.mock('@/app/(auth)/actions', () => ({ oneTapAction: vi.fn() }));

// T55 (décision 5 d'Amos du 11/11) : la reconnexion de la section Mémoire ne montre pas « Continuer en tant que… »,
// dont la connexion ramène toujours à l'accueil.
describe('offersOneTap', () => {
  it('pas de fenêtre sur /connexion?retour=memoire', () => {
    expect(offersOneTap('?retour=memoire')).toBe(false);
    expect(offersOneTap('?error=x&retour=memoire')).toBe(false);
  });

  it('ailleurs, la fenêtre reste proposée', () => {
    expect(offersOneTap('')).toBe(true);
    expect(offersOneTap('?retour=autre')).toBe(true);
    expect(offersOneTap('?port=4242')).toBe(true);
  });
});
