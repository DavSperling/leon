import { afterEach, describe, expect, it, vi } from 'vitest';
import { offersOneTap, startOneTap } from './google-one-tap';

// L'action ouvre Better Auth : seule la règle d'affichage, et ce que le démarrage en fait, se testent ici.
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

// Sans navigateur dans ces tests : la page, la session et le script de Google sont des doublures.
describe('startOneTap', () => {
  afterEach(() => vi.unstubAllGlobals());

  const browser = (search: string) => {
    const fetchSession = vi.fn(async () => ({ ok: true, json: async () => null }));
    const append = vi.fn();
    vi.stubGlobal('window', { location: { search } });
    vi.stubGlobal('fetch', fetchSession);
    vi.stubGlobal('document', { createElement: () => ({}), head: { append } });
    return { fetchSession, append };
  };

  it('sur /connexion?retour=memoire, ni la session ni le script de Google ne sont demandés', async () => {
    const { fetchSession, append } = browser('?retour=memoire');

    await startOneTap('client', () => false);

    expect(fetchSession).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('ailleurs, sans session, la session est demandée puis le script de Google chargé', async () => {
    const { fetchSession, append } = browser('');

    await startOneTap('client', () => false);

    expect(fetchSession).toHaveBeenCalledWith('/api/auth/get-session', {
      credentials: 'same-origin',
    });
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({ src: 'https://accounts.google.com/gsi/client' }),
    );
  });
});
