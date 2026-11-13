import { redirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type OnboardingMember, readOnboardingMember } from '@/server/auth/onboarding';
import { requireUserContext } from '@/server/auth/session';
import { getViewerProfile } from '@/server/auth/viewer';
import { channelHealth } from '@/server/memory/sources';
import { readSidebar } from '@/server/shell/shell';
import AppLayout from './layout';

vi.mock('@/server/auth/session', () => ({
  ONBOARDING_PATH: '/bienvenue',
  requireUserContext: vi.fn(),
}));
vi.mock('@/server/auth/onboarding', () => ({ readOnboardingMember: vi.fn() }));
vi.mock('@/server/auth/viewer', () => ({ getViewerProfile: vi.fn() }));
vi.mock('@/server/memory/sources', () => ({
  channelHealth: vi.fn(),
  staleChannels: vi.fn(() => []),
}));
vi.mock('@/server/shell/shell', () => ({ readSidebar: vi.fn() }));
vi.mock('@/server/admin/stats', () => ({
  isAdmin: (email: string) => email === 'ana@example.com',
}));
// La coque est un composant client : le layout se teste par ce qu'il lui passe.
vi.mock('@/components/verre/shell', () => ({ AppShell: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));

const CTX = { userId: 'u1', tenantId: 't1', principals: ['u1', 't1'] };
const member = (onboardedAt: Date | null) => ({ onboardedAt }) as OnboardingMember;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUserContext).mockResolvedValue(CTX);
  vi.mocked(getViewerProfile).mockResolvedValue({
    organizationName: 'Acme',
    userName: 'Ana',
    email: 'ana@example.com',
  } as never);
  vi.mocked(channelHealth).mockResolvedValue([]);
  vi.mocked(readSidebar).mockResolvedValue({
    image: null,
    recents: [{ id: 'd1', title: 'Où en est ACME ?' }],
    reconnect: ['gmail'],
  });
});

describe('layout de l’application', () => {
  it('renvoie vers /bienvenue tant que l’étape 1 n’est pas validée', async () => {
    vi.mocked(readOnboardingMember).mockResolvedValue(member(null));

    await expect(AppLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT /bienvenue');

    expect(redirect).toHaveBeenCalledWith('/bienvenue');
    expect(getViewerProfile).not.toHaveBeenCalled();
  });

  it('affiche l’appli une fois l’étape 1 validée', async () => {
    vi.mocked(readOnboardingMember).mockResolvedValue(member(new Date()));

    await AppLayout({ children: null });

    expect(redirect).not.toHaveBeenCalled();
    expect(getViewerProfile).toHaveBeenCalledWith(CTX);
  });

  it('passe à la coque ce que la barre latérale montre, lu sous les droits de la personne', async () => {
    vi.mocked(readOnboardingMember).mockResolvedValue(member(new Date()));

    const tree = (await AppLayout({ children: null })) as { props: Record<string, unknown> };

    expect(readSidebar).toHaveBeenCalledWith(CTX);
    expect(tree.props).toMatchObject({
      organizationName: 'Acme',
      userName: 'Ana',
      userEmail: 'ana@example.com',
      userImage: null,
      admin: true,
      recents: [{ id: 'd1', title: 'Où en est ACME ?' }],
      reconnect: ['gmail'],
      stale: [],
    });
  });

  it('ne lit rien pour la barre latérale avant la redirection', async () => {
    vi.mocked(readOnboardingMember).mockResolvedValue(member(null));

    await expect(AppLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT /bienvenue');

    expect(readSidebar).not.toHaveBeenCalled();
  });

  it('affiche l’appli si l’appartenance est introuvable', async () => {
    vi.mocked(readOnboardingMember).mockResolvedValue(null);

    await AppLayout({ children: null });

    expect(redirect).not.toHaveBeenCalled();
  });
});
