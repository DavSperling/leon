import { cookies } from 'next/headers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireUserContext, signOutCurrentUser } from '@/server/auth/session';
import { searchMemory } from '@/server/memory/search';
import { searchAction, setThemeAction, signOutAction } from './actions';

vi.mock('@/server/auth/session', () => ({
  requireUserContext: vi.fn(),
  signOutCurrentUser: vi.fn(),
}));
vi.mock('@/server/memory/search', () => ({ searchMemory: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));

beforeEach(() => vi.clearAllMocks());

describe('signOutAction', () => {
  it('ferme la session puis renvoie à la connexion', async () => {
    await expect(signOutAction()).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(signOutCurrentUser).toHaveBeenCalledOnce();
  });

  it('ne ferme rien sans session valide', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(signOutAction()).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(signOutCurrentUser).not.toHaveBeenCalled();
  });
});

describe('searchAction', () => {
  const ctx = { tenantId: 'tenant', userId: 'user', principals: ['user', 'tenant'] };

  it('cherche pour le lecteur connecté, requête nettoyée', async () => {
    vi.mocked(requireUserContext).mockResolvedValue(ctx);
    vi.mocked(searchMemory).mockResolvedValue([]);

    await expect(searchAction('  acme  ')).resolves.toEqual([]);

    expect(searchMemory).toHaveBeenCalledWith(ctx, { query: 'acme' });
  });

  it.each(['', '   ', 'a'.repeat(201)])('refuse la requête %j sans chercher', async (query) => {
    vi.mocked(requireUserContext).mockResolvedValue(ctx);

    await expect(searchAction(query)).rejects.toThrow();

    expect(searchMemory).not.toHaveBeenCalled();
  });

  it('ne cherche rien sans session valide', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(searchAction('acme')).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(searchMemory).not.toHaveBeenCalled();
  });
});

describe('setThemeAction', () => {
  const set = vi.fn();

  beforeEach(() => {
    vi.mocked(cookies).mockResolvedValue({ set } as unknown as Awaited<ReturnType<typeof cookies>>);
  });

  it.each(['clair', 'sombre', 'systeme'])('enregistre le thème %s pour un an', async (theme) => {
    await setThemeAction(theme);

    expect(set).toHaveBeenCalledWith('leon-theme', theme, {
      path: '/',
      maxAge: 31536000,
      sameSite: 'lax',
    });
  });

  it.each(['', 'dark', 'SOMBRE', 'clair; path=/x'])(
    'refuse la valeur %j sans rien écrire',
    async (theme) => {
      await expect(setThemeAction(theme)).rejects.toThrow();

      expect(set).not.toHaveBeenCalled();
    },
  );
});
