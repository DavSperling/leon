import { redirect } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from './auth';
import { getUserContext, requireUserContext, signedInRecently } from './session';
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

// T55 (D37) : écrire, corriger ou remettre une version exigent une connexion de moins d'une heure. L'heure est celle
// de la connexion (`createdAt`), que le rafraîchissement de la session ne touche pas (il ne change que `updatedAt` et
// `expiresAt`).
describe('signedInRecently', () => {
  const NOW = new Date('2026-11-11T12:00:00Z');
  const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
  const sessionAt = (createdAt: Date, updatedAt = createdAt) =>
    ({ user: { id: USER }, session: { id: 's1', createdAt, updatedAt } }) as never;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('une session ouverte il y a 59 minutes passe', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(sessionAt(minutesAgo(59)));

    expect(await signedInRecently()).toBe(true);
  });

  it('à 61 minutes, refus', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(sessionAt(minutesAgo(61)));

    expect(await signedInRecently()).toBe(false);
  });

  it('une session ancienne mais rafraîchie (updatedAt récent) est refusée', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(
      sessionAt(minutesAgo(3 * 24 * 60), minutesAgo(1)),
    );

    expect(await signedInRecently()).toBe(false);
  });

  it('sans session, refus', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    expect(await signedInRecently()).toBe(false);
  });
});
