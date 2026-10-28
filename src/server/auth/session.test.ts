import { redirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from './auth';
import { getUserContext, requireUserContext } from './session';
import { resolveTenantContext } from './tenant-context';

vi.mock('./auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('./tenant-context', () => ({ resolveTenantContext: vi.fn() }));
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
    vi.mocked(resolveTenantContext).mockResolvedValue(null);

    await expect(requireUserContext()).rejects.toThrow('NEXT_REDIRECT /bienvenue');

    expect(redirect).toHaveBeenCalledWith('/bienvenue');
  });

  it('avec une organisation, rend le contexte sans rediriger', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(sessionOf('t1'));
    vi.mocked(resolveTenantContext).mockResolvedValue(CTX as never);

    expect(await requireUserContext()).toEqual(CTX);

    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('getUserContext', () => {
  it("se rabat sur la première organisation quand l'organisation active n'est plus la sienne", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(sessionOf(OLD));
    vi.mocked(resolveTenantContext)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(CTX as never);

    expect(await getUserContext()).toEqual(CTX);

    expect(resolveTenantContext).toHaveBeenNthCalledWith(1, USER, OLD);
    expect(resolveTenantContext).toHaveBeenLastCalledWith(USER, null);
  });

  it("ne cherche pas de repli quand l'organisation active est la sienne", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(sessionOf('t1'));
    vi.mocked(resolveTenantContext).mockResolvedValue(CTX as never);

    expect(await getUserContext()).toEqual(CTX);

    expect(resolveTenantContext).toHaveBeenCalledOnce();
  });

  it("n'a rien à rabattre sans organisation active : null", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(sessionOf(null));
    vi.mocked(resolveTenantContext).mockResolvedValue(null);

    expect(await getUserContext()).toBeNull();

    expect(resolveTenantContext).toHaveBeenCalledOnce();
  });
});
