import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireUserContext } from '@/server/auth/session';
import { setRepoSharing, setSessionSharing } from '@/server/developpeurs/partage';
import { setRepoSharingAction, setSessionSharingAction } from './actions';

vi.mock('@/server/auth/session', () => ({ requireUserContext: vi.fn() }));
vi.mock('@/server/developpeurs/partage', () => ({
  GITHUB_PROJECT: /^github\.com\/[a-z0-9._-]+\/[a-z0-9._-]+$/,
  setRepoSharing: vi.fn(),
  setSessionSharing: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const ctx = { tenantId: 'tenant', userId: 'user', principals: ['user', 'tenant'] };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUserContext).mockResolvedValue(ctx);
});

describe('setSessionSharingAction', () => {
  it('« Rendre privée » et « Partager » appellent setSessionSharing, puis rafraîchissent la page', async () => {
    const id = randomUUID();

    await setSessionSharingAction(form({ id, partage: '0' }));
    await setSessionSharingAction(form({ id, partage: '1' }));

    expect(setSessionSharing).toHaveBeenNthCalledWith(1, ctx, id, false);
    expect(setSessionSharing).toHaveBeenNthCalledWith(2, ctx, id, true);
    expect(revalidatePath).toHaveBeenCalledWith('/developpeurs');
  });

  it('ignore un identifiant invalide', async () => {
    await setSessionSharingAction(form({ id: 'pas-un-uuid', partage: '0' }));

    expect(setSessionSharing).not.toHaveBeenCalled();
  });
});

describe('setRepoSharingAction', () => {
  it('l’interrupteur appelle setRepoSharing avec le dépôt', async () => {
    await setRepoSharingAction(form({ project: 'github.com/acme/app', partage: '0' }));

    expect(setRepoSharing).toHaveBeenCalledExactlyOnceWith(ctx, 'github.com/acme/app', false);
    expect(revalidatePath).toHaveBeenCalledWith('/developpeurs');
  });

  it('ignore une clé qui n’est pas un dépôt GitHub', async () => {
    await setRepoSharingAction(form({ project: 'dossier:0123456789abcdef', partage: '0' }));

    expect(setRepoSharing).not.toHaveBeenCalled();
  });
});
