import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AboutStep } from '@/components/verre/onboarding/about-step';
import {
  isSoleMember,
  type OnboardingMember,
  readOnboardingMember,
} from '@/server/auth/onboarding';
import { getSession, getUserContext } from '@/server/auth/session';
import { getViewerProfile } from '@/server/auth/viewer';
import WelcomePage from './page';

vi.mock('@/server/auth/session', () => ({ getSession: vi.fn(), getUserContext: vi.fn() }));
vi.mock('@/server/auth/onboarding', () => ({
  readOnboardingMember: vi.fn(),
  isSoleMember: vi.fn(),
  // La vraie fonction lit une base ; la règle des rôles séparés par des virgules suffit ici.
  spaceRole: (role: string) =>
    role.includes('owner') ? 'owner' : role.includes('admin') ? 'admin' : 'member',
}));
vi.mock('@/server/auth/viewer', () => ({ getViewerProfile: vi.fn() }));
// Le composant client importe les actions de Réglages, donc Better Auth : seule la règle de la page se teste ici.
vi.mock('@/components/verre/onboarding/about-step', () => ({ AboutStep: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));

const CTX = { userId: 'u1', tenantId: 't1', principals: ['u1', 't1'] };
const member = (over: Partial<OnboardingMember> = {}): OnboardingMember => ({
  role: 'owner',
  department: null,
  job: null,
  seniority: null,
  goals: [],
  onboardedAt: null,
  ...over,
});
const render = async () => (await WelcomePage()) as ReactElement<Record<string, unknown>>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ user: { id: 'u1', name: 'Ana' } } as never);
  vi.mocked(getUserContext).mockResolvedValue(CTX);
  vi.mocked(readOnboardingMember).mockResolvedValue(member());
  vi.mocked(isSoleMember).mockResolvedValue(true);
  vi.mocked(getViewerProfile).mockResolvedValue({
    organizationName: 'Acme',
    userName: 'Ana',
    email: 'ana@example.com',
  } as never);
});

describe('page de l’étape Vous', () => {
  it('sans session → /connexion', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await expect(render()).rejects.toThrow('NEXT_REDIRECT');

    expect(redirect).toHaveBeenLastCalledWith('/connexion');
  });

  it('étape déjà validée ou membre introuvable → /', async () => {
    vi.mocked(readOnboardingMember).mockResolvedValue(member({ onboardedAt: new Date() }));
    await expect(render()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenLastCalledWith('/');

    vi.mocked(readOnboardingMember).mockResolvedValue(null);
    await expect(render()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenLastCalledWith('/');
  });

  it('un nouveau venu, sans espace, aura trois étapes', async () => {
    vi.mocked(getUserContext).mockResolvedValue(null);

    const element = await render();

    expect(element.type).toBe(AboutStep);
    expect(element.props).toMatchObject({
      mode: 'newcomer',
      steps: ['about', 'tools', 'teammates'],
    });
    expect(readOnboardingMember).not.toHaveBeenCalled();
  });

  it('un propriétaire seul a trois étapes', async () => {
    const element = await render();

    expect(element.props).toMatchObject({ mode: 'owner', steps: ['about', 'tools', 'teammates'] });
    expect(isSoleMember).toHaveBeenCalledWith(CTX);
  });

  it('un propriétaire qui a une équipe n’a que cette étape', async () => {
    vi.mocked(isSoleMember).mockResolvedValue(false);

    expect((await render()).props).toMatchObject({ mode: 'owner', steps: ['about'] });
  });

  it.each(['member', 'admin'])('%s : deux étapes, sans compter les membres', async (role) => {
    vi.mocked(readOnboardingMember).mockResolvedValue(member({ role }));

    expect((await render()).props).toMatchObject({ mode: 'member', steps: ['about', 'tools'] });
    expect(isSoleMember).not.toHaveBeenCalled();
  });
});
