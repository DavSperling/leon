import { redirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from './auth';
import { getUserContext, requireUserContext } from './session';
import { resolveSessionContext } from './tenant-context';

vi.mock('./auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('./tenant-context', () => ({ resolveSessionContext: vi.fn() }));
vi.mock('@/server/admin/stats', () => ({ noteActivity: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ getAll: () => [] })),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));

const USER = 'u1';
const OLD = 'org-retiree';
const CTX = { userId: USER, tenantId: 't1' };
const sessionOf = (activeOrganizationId: string | null) =>
  ({ user: { id: USER }, session: { id: 's1', activeOrganizationId } }) as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireUserContext', () => {
  it('sans session, renvoie vers la connexion', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    await expect(requireUserContext()).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(redirect).toHaveBeenCalledWith('/connexion');
  });

  it('une session sans organisation est renvoyée vers /bienvenue', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(sessionOf(null));
    vi.mocked(resolveSessionContext).mockResolvedValue(null);

    await expect(requireUserContext()).rejects.toThrow('NEXT_REDIRECT /bienvenue');

    expect(redirect).toHaveBeenCalledWith('/bienvenue');
  });

  it('avec une organisation, rend le contexte sans rediriger', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(sessionOf('t1'));
    vi.mocked(resolveSessionContext).mockResolvedValue(CTX as never);

    expect(await requireUserContext()).toEqual(CTX);

    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('getUserContext', () => {
  it("passe l'organisation active de la session à resolveSessionContext, qui porte le repli", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(sessionOf(OLD));
    vi.mocked(resolveSessionContext).mockResolvedValue(CTX as never);

    expect(await getUserContext()).toEqual(CTX);

    expect(resolveSessionContext).toHaveBeenCalledExactlyOnceWith(USER, OLD);
  });

  it('sans organisation active ni première organisation : null', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(sessionOf(null));
    vi.mocked(resolveSessionContext).mockResolvedValue(null);

    expect(await getUserContext()).toBeNull();

    expect(resolveSessionContext).toHaveBeenCalledExactlyOnceWith(USER, null);
  });

  it('sans session : null, sans chercher de contexte', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    expect(await getUserContext()).toBeNull();

    expect(resolveSessionContext).not.toHaveBeenCalled();
  });
});
