import { redirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type OnboardingMember, readOnboardingMember } from '@/server/auth/onboarding';
import { getSession, requireUserContext } from '@/server/auth/session';
import { getViewerProfile } from '@/server/auth/viewer';
import { saveLocale } from '@/server/briefing/about';
import { logError } from '@/server/log';
import { channelHealth } from '@/server/memory/sources';
import { readSidebar } from '@/server/shell/shell';
import AppLayout from './layout';

vi.mock('@/server/auth/session', () => ({
  ONBOARDING_PATH: '/welcome',
  requireUserContext: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock('@/server/briefing/about', () => ({ saveLocale: vi.fn(async () => {}) }));
vi.mock('@/server/log', () => ({ logError: vi.fn() }));
// Le cookie de langue de ce navigateur : absent, sauf dit autrement.
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
  }),
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
  jar.clear();
  vi.mocked(requireUserContext).mockResolvedValue(CTX);
  vi.mocked(getSession).mockResolvedValue({ user: { locale: null } } as never);
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
  it('renvoie vers /welcome tant que l’étape 1 n’est pas validée', async () => {
    vi.mocked(readOnboardingMember).mockResolvedValue(member(null));

    await expect(AppLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT /welcome');

    expect(redirect).toHaveBeenCalledWith('/welcome');
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

    await expect(AppLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT /welcome');

    expect(readSidebar).not.toHaveBeenCalled();
  });

  it('affiche l’appli si l’appartenance est introuvable', async () => {
    vi.mocked(readOnboardingMember).mockResolvedValue(null);

    await AppLayout({ children: null });

    expect(redirect).not.toHaveBeenCalled();
  });
});

// Une langue choisie avant qu'elle ne se garde avec le compte (0094) ne vit que dans le cookie de ce navigateur.
describe('la langue déjà choisie dans ce navigateur', () => {
  beforeEach(() => {
    vi.mocked(readOnboardingMember).mockResolvedValue(member(new Date()));
  });

  it('son compte la reprend quand il n’en a aucune', async () => {
    jar.set('leon-locale', 'fr');

    await AppLayout({ children: null });

    expect(saveLocale).toHaveBeenCalledWith(CTX, 'fr');
  });

  it('rien ne s’écrit sans cookie, avec un cookie inconnu, ni quand le compte a déjà sa langue', async () => {
    await AppLayout({ children: null });
    jar.set('leon-locale', 'de');
    await AppLayout({ children: null });
    jar.set('leon-locale', 'fr');
    vi.mocked(getSession).mockResolvedValue({ user: { locale: 'en' } } as never);
    await AppLayout({ children: null });

    expect(saveLocale).not.toHaveBeenCalled();
  });

  it('une base en panne n’empêche pas d’afficher l’appli : la panne est notée', async () => {
    jar.set('leon-locale', 'fr');
    vi.mocked(saveLocale).mockRejectedValueOnce(new Error('base injoignable'));

    await AppLayout({ children: null });

    expect(logError).toHaveBeenCalledWith('langue.reprise', expect.any(Error), { userId: 'u1' });
    expect(getViewerProfile).toHaveBeenCalledWith(CTX);
  });

  it('rien ne s’écrit avant la redirection vers l’onboarding', async () => {
    jar.set('leon-locale', 'fr');
    vi.mocked(readOnboardingMember).mockResolvedValue(member(null));

    await expect(AppLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT /welcome');

    expect(saveLocale).not.toHaveBeenCalled();
  });
});
