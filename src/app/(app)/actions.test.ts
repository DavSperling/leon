import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireUserContext, signOutCurrentUser } from '@/server/auth/session';
import { signOutAction } from './actions';

vi.mock('@/server/auth/session', () => ({
  requireUserContext: vi.fn(),
  signOutCurrentUser: vi.fn(),
}));
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
