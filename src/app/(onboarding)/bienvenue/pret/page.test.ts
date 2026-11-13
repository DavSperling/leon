import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DoneStep } from '@/components/verre/onboarding/done-step';
import { type OnboardingMember, readOnboardingMember } from '@/server/auth/onboarding';
import { getSession, getUserContext } from '@/server/auth/session';
import DonePage, { generateMetadata } from './page';

vi.mock('@/server/auth/session', () => ({ getSession: vi.fn(), getUserContext: vi.fn() }));
vi.mock('@/server/auth/onboarding', () => ({ readOnboardingMember: vi.fn() }));
vi.mock('@/components/verre/onboarding/done-step', () => ({ DoneStep: vi.fn() }));
vi.mock('@/server/connectors/catalog', () => ({
  listCatalog: vi.fn(() => [
    { id: 'github', label: 'GitHub', privateRaw: false },
    { id: 'gmail', label: 'Gmail', privateRaw: true },
    { id: 'linear', label: 'Linear', privateRaw: false },
    { id: 'notion', label: 'Notion', privateRaw: false },
  ]),
}));
// La mienne qui marche, le Gmail privé d'un collègue, la mienne en erreur ; Notion n'est pas branché.
vi.mock('@/server/connectors/connections', () => ({
  listConnections: vi.fn(async () => [
    {
      provider: 'github',
      isCreator: true,
      creatorLeft: false,
      status: 'active',
      createdBy: { name: 'Moi' },
    },
    {
      provider: 'gmail',
      isCreator: false,
      creatorLeft: false,
      status: 'active',
      createdBy: { name: 'Hugo' },
    },
    {
      provider: 'linear',
      isCreator: true,
      creatorLeft: false,
      status: 'error',
      createdBy: { name: 'Moi' },
    },
  ]),
}));
vi.mock('next-intl/server', () => ({
  getLocale: vi.fn(async () => 'en'),
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
  await expect(DonePage()).rejects.toThrow('NEXT_REDIRECT');
  expect(redirect).toHaveBeenLastCalledWith(path);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ user: { id: 'u1' } } as never);
  vi.mocked(getUserContext).mockResolvedValue(CTX);
  vi.mocked(readOnboardingMember).mockResolvedValue(member());
});

describe('page de fin de l’onboarding', () => {
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
  });

  it('étape 1 à faire → /bienvenue', async () => {
    vi.mocked(readOnboardingMember).mockResolvedValue(member({ onboardedAt: null }));

    await redirectsTo('/bienvenue');
  });

  it('propriétaire, administrateur ou membre : le même écran de fin', async () => {
    for (const role of ['owner', 'admin', 'member']) {
      vi.mocked(readOnboardingMember).mockResolvedValue(member({ role }));
      const element = (await DonePage()) as ReactElement;

      expect(redirect).not.toHaveBeenCalled();
      expect(element.type).toBe(DoneStep);
      // Ce que Leon lit pour cette personne : ni l'outil privé d'un collègue, ni sa connexion en erreur, ni le non branché.
      expect(element.props).toEqual({ reading: [{ id: 'github', label: 'GitHub' }] });
    }
  });

  it('le titre de l’onglet vient de onboarding.done', async () => {
    expect(await generateMetadata()).toEqual({ title: 'title' });
    expect(getTranslations).toHaveBeenCalledWith('onboarding.done');
  });
});
