import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeammatesStep } from '@/components/verre/onboarding/teammates-step';
import { canInvite } from '@/server/auth/members';
import { type OnboardingMember, readOnboardingMember } from '@/server/auth/onboarding';
import { getSession, getUserContext } from '@/server/auth/session';
import { getViewerProfile } from '@/server/auth/viewer';
import TeammatesPage, { generateMetadata } from './page';

vi.mock('@/server/auth/session', () => ({ getSession: vi.fn(), getUserContext: vi.fn() }));
vi.mock('@/server/auth/onboarding', () => ({ readOnboardingMember: vi.fn() }));
vi.mock('@/server/auth/members', () => ({ canInvite: vi.fn() }));
vi.mock('@/server/auth/viewer', () => ({ getViewerProfile: vi.fn() }));
// Le composant client importe les actions de Réglages, donc Better Auth : seule la règle de la page se teste ici.
vi.mock('@/components/verre/onboarding/teammates-step', () => ({ TeammatesStep: vi.fn() }));
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
  department: 'engineering',
  job: 'backend',
  seniority: 5,
  goals: [],
  onboardedAt: new Date(),
  ...over,
});

const redirectsTo = async (path: string) => {
  await expect(TeammatesPage()).rejects.toThrow('NEXT_REDIRECT');
  expect(redirect).toHaveBeenLastCalledWith(path);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ user: { id: 'u1' } } as never);
  vi.mocked(getUserContext).mockResolvedValue(CTX);
  vi.mocked(readOnboardingMember).mockResolvedValue(member());
  vi.mocked(canInvite).mockResolvedValue(true);
  vi.mocked(getViewerProfile).mockResolvedValue({
    organizationName: 'Acme',
    userName: 'Ana',
    email: 'ana@example.com',
  } as never);
});

describe('page de l’étape Collaborateurs', () => {
  it('sans session → /connexion', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await redirectsTo('/connexion');

    expect(getUserContext).not.toHaveBeenCalled();
  });

  it('sans espace → /bienvenue', async () => {
    vi.mocked(getUserContext).mockResolvedValue(null);

    await redirectsTo('/bienvenue');

    expect(readOnboardingMember).not.toHaveBeenCalled();
  });

  it('membre introuvable → /', async () => {
    vi.mocked(readOnboardingMember).mockResolvedValue(null);

    await redirectsTo('/');

    expect(canInvite).not.toHaveBeenCalled();
  });

  it('étape 1 à faire → /bienvenue', async () => {
    vi.mocked(readOnboardingMember).mockResolvedValue(member({ onboardedAt: null }));

    await redirectsTo('/bienvenue');

    expect(canInvite).not.toHaveBeenCalled();
  });

  it('un membre qui n’est pas administrateur → /', async () => {
    vi.mocked(canInvite).mockResolvedValue(false);

    await redirectsTo('/');

    expect(canInvite).toHaveBeenCalledWith(CTX);
    expect(getViewerProfile).not.toHaveBeenCalled();
  });

  it('un propriétaire dont l’étape 1 est faite voit l’écran, avec son nom et son poste', async () => {
    const element = (await TeammatesPage()) as ReactElement;

    expect(redirect).not.toHaveBeenCalled();
    expect(element.type).toBe(TeammatesStep);
    expect(element.props).toEqual({
      organizationName: 'Acme',
      you: { name: 'Ana', placement: { department: 'engineering', job: 'backend', seniority: 5 } },
    });
  });

  it('le titre de l’onglet vient de onboarding.teammates', async () => {
    expect(await generateMetadata()).toEqual({ title: 'title' });
    expect(getTranslations).toHaveBeenCalledWith('onboarding.teammates');
  });
});
