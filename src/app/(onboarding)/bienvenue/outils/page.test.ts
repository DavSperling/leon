import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolsStep } from '@/components/verre/onboarding/tools-step';
import {
  isSoleMember,
  type OnboardingMember,
  readOnboardingMember,
} from '@/server/auth/onboarding';
import { getSession, getUserContext } from '@/server/auth/session';
import { claudeCodeInstructions, installCommand } from '@/server/cli/install-command';
import { listCatalog } from '@/server/connectors/catalog';
import { listConnections } from '@/server/connectors/connections';
import { connectorsKey } from '@/server/connectors/crypto';
import ToolsPage, { generateMetadata } from './page';

vi.mock('@/server/auth/session', () => ({ getSession: vi.fn(), getUserContext: vi.fn() }));
vi.mock('@/server/auth/onboarding', () => ({
  readOnboardingMember: vi.fn(),
  isSoleMember: vi.fn(),
  // La vraie fonction lit une base ; la règle des rôles séparés par des virgules suffit ici.
  spaceRole: (role: string) =>
    role.includes('owner') ? 'owner' : role.includes('admin') ? 'admin' : 'member',
}));
vi.mock('@/server/cli/install-command', () => ({
  installCommand: vi.fn(),
  claudeCodeInstructions: vi.fn(),
}));
vi.mock('@/server/connectors/catalog', () => ({ listCatalog: vi.fn() }));
vi.mock('@/server/connectors/connections', () => ({ listConnections: vi.fn() }));
vi.mock('@/server/connectors/crypto', () => ({ connectorsKey: vi.fn() }));
// Le composant client importe les actions de Connexions, donc Better Auth : seule la règle de la page se teste ici.
vi.mock('@/components/verre/onboarding/tools-step', () => ({ ToolsStep: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  getLocale: vi.fn(async () => 'en'),
}));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
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
const catalogItem = (id: string, extra: object = {}) => ({
  id,
  label: id,
  privateRaw: false,
  available: true,
  triedForReal: true,
  oauthReady: true,
  adminConsentUrl: null,
  ...extra,
});
const cookieJar = (value?: string) =>
  ({ get: (name: string) => (value && name === 'leon_outils' ? { value } : undefined) }) as never;
const teamConnection = (provider: string) => ({
  provider,
  status: 'active',
  createdBy: { id: 'u2', name: 'Inès' },
  isCreator: false,
  creatorLeft: false,
});

const render = async (searchParams: Record<string, string> = {}) =>
  (await ToolsPage({ searchParams: Promise.resolve(searchParams) })) as ReactElement<
    Record<string, unknown>
  >;
const redirectsTo = async (path: string) => {
  await expect(render()).rejects.toThrow('NEXT_REDIRECT');
  expect(redirect).toHaveBeenLastCalledWith(path);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ user: { id: 'u1' } } as never);
  vi.mocked(getUserContext).mockResolvedValue(CTX);
  vi.mocked(readOnboardingMember).mockResolvedValue(member());
  vi.mocked(isSoleMember).mockResolvedValue(true);
  vi.mocked(listCatalog).mockReturnValue([catalogItem('github'), catalogItem('airtable')] as never);
  vi.mocked(listConnections).mockResolvedValue([]);
  vi.mocked(connectorsKey).mockReturnValue(Buffer.alloc(32));
  vi.mocked(installCommand).mockReturnValue('curl -fsSL https://leon.example/install | sh');
  vi.mocked(claudeCodeInstructions).mockReturnValue('Install Leon');
  vi.mocked(cookies).mockResolvedValue(cookieJar());
});

describe('page de l’étape Vos outils', () => {
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

    expect(listConnections).not.toHaveBeenCalled();
  });

  it('étape 1 à faire → /bienvenue', async () => {
    vi.mocked(readOnboardingMember).mockResolvedValue(member({ onboardedAt: null }));

    await redirectsTo('/bienvenue');

    expect(listConnections).not.toHaveBeenCalled();
  });

  it('un propriétaire seul voit l’écran en trois étapes, les outils de son service conseillés, et la suite est les collaborateurs', async () => {
    const element = await render();

    expect(redirect).not.toHaveBeenCalled();
    expect(element.type).toBe(ToolsStep);
    expect(element.props).toMatchObject({
      viewerId: 'u1',
      canConnect: true,
      consentUrl: null,
      nextHref: '/bienvenue/collaborateurs',
      steps: ['about', 'tools', 'teammates'],
      notice: null,
      connecting: false,
      chosen: null,
    });
    expect(element.props.now).toBeInstanceOf(Date);
    expect(element.props.states).toEqual([
      {
        item: expect.objectContaining({ id: 'github' }),
        recommended: true,
        status: 'free',
        connectedBy: null,
        broken: null,
        ready: true,
      },
      {
        item: expect.objectContaining({ id: 'airtable' }),
        recommended: false,
        status: 'free',
        connectedBy: null,
        broken: null,
        ready: true,
      },
    ]);
  });

  it('un propriétaire qui a une équipe va à la fin, avec le seul fil de son parcours', async () => {
    vi.mocked(isSoleMember).mockResolvedValue(false);

    expect((await render()).props).toMatchObject({
      nextHref: '/bienvenue/pret',
      steps: ['about'],
    });
  });

  it('un administrateur ou un membre vont à la fin, en deux étapes', async () => {
    for (const role of ['admin', 'member']) {
      vi.mocked(readOnboardingMember).mockResolvedValue(member({ role }));
      expect((await render()).props).toMatchObject({
        nextHref: '/bienvenue/pret',
        steps: ['about', 'tools'],
      });
    }
  });

  it('ne compte les membres que pour un propriétaire', async () => {
    vi.mocked(readOnboardingMember).mockResolvedValue(member({ role: 'member' }));

    await render();

    expect(isSoleMember).not.toHaveBeenCalled();
  });

  it('un outil branché par un collègue est « à l’équipe » avec son nom', async () => {
    vi.mocked(listConnections).mockResolvedValue([teamConnection('github')] as never);

    const { states } = (await render()).props as { states: { item: { id: string } }[] };

    expect(states[0]).toMatchObject({ status: 'team', connectedBy: 'Inès' });
    expect(listConnections).toHaveBeenCalledWith(CTX);
  });

  it('n’envoie au client aucune connexion de l’espace, seulement l’état de chaque outil', async () => {
    vi.mocked(listConnections).mockResolvedValue([
      { ...teamConnection('github'), secretHint: 'abcd', config: { token: 'x' } },
    ] as never);

    const { props } = await render();

    expect(props).not.toHaveProperty('conns');
    expect(JSON.stringify(props)).not.toContain('abcd');
  });

  it('ma connexion en erreur part au client dans `broken`, jamais celle d’un collègue', async () => {
    const mine = {
      ...teamConnection('github'),
      id: 'c1',
      isCreator: true,
      status: 'error',
      secretHint: 'mine',
    };
    vi.mocked(listConnections).mockResolvedValue([
      mine,
      {
        ...teamConnection('airtable'),
        status: 'error',
        secretHint: 'abcd',
        config: { token: 'x' },
      },
    ] as never);

    const { props } = await render();
    const states = props.states as { item: { id: string }; broken: unknown }[];

    expect(props).not.toHaveProperty('conns');
    expect(states.map((s) => [s.item.id, s.broken])).toEqual([
      ['github', mine],
      ['airtable', null],
    ]);
    expect(JSON.stringify(props)).not.toContain('abcd');
  });

  it('un service inconnu ou absent ne conseille rien', async () => {
    vi.mocked(readOnboardingMember).mockResolvedValue(member({ department: null }));
    const none = (await render()).props.states as { recommended: boolean }[];
    expect(none.some((s) => s.recommended)).toBe(false);

    vi.mocked(readOnboardingMember).mockResolvedValue(member({ department: 'toString' }));
    const unknown = (await render()).props.states as { recommended: boolean }[];
    expect(unknown.some((s) => s.recommended)).toBe(false);
  });

  // S13 : la commande et la consigne de « Je demande à Claude » sont bâties côté serveur ; sans adresse de serveur
  // acceptée, le bloc ne s'affiche pas.
  it('donne à l’étape la commande d’installation et la consigne de Claude Code, ou null quand l’adresse est refusée', async () => {
    const props = (await render()).props;

    expect(props.codeCommand).toBe('curl -fsSL https://leon.example/install | sh');
    expect(props.codeInstructions).toBe('Install Leon');
    // la consigne se traduit avec les messages « claudeCode », dans la langue de la personne
    expect(getTranslations).toHaveBeenCalledWith('claudeCode');
    expect(claudeCodeInstructions).toHaveBeenCalledWith(expect.any(Function));

    vi.mocked(installCommand).mockReturnValue(null);
    vi.mocked(claudeCodeInstructions).mockReturnValue(null);

    const refused = (await render()).props;
    expect(refused.codeCommand).toBeNull();
    expect(refused.codeInstructions).toBeNull();
  });

  it('sans clé de chiffrement, on ne peut pas brancher', async () => {
    vi.mocked(connectorsKey).mockReturnValue(null);

    expect((await render()).props.canConnect).toBe(false);
  });

  it('le retour de l’éditeur donne l’avis, et le lien d’accord de l’outil vient du catalogue', async () => {
    vi.mocked(listCatalog).mockReturnValue([
      catalogItem('outlook', { adminConsentUrl: 'https://login.example/consent' }),
    ] as never);

    const { notice, consentUrl } = (await render({ erreur: 'admin', outil: 'outlook' })).props;

    expect(notice).toMatchObject({ tone: 'error', tool: 'outlook', adminConsent: true });
    expect(consentUrl).toBe('https://login.example/consent');
  });

  it('la file « Branchez-les un par un » : après le choix (`?etape=brancher`) et au retour de l’éditeur', async () => {
    expect((await render({ etape: 'brancher' })).props.connecting).toBe(true);
    expect((await render({ branche: 'github' })).props.connecting).toBe(true);
    expect((await render({ erreur: 'annule', outil: 'github' })).props.connecting).toBe(true);
    expect((await render({ etape: 'autre' })).props.connecting).toBe(false);
  });

  it('reprend le choix gardé dans le cookie, pour cette personne seulement', async () => {
    vi.mocked(cookies).mockResolvedValue(cookieJar('u1:gmail,github'));
    expect((await render()).props.chosen).toEqual(['github', 'gmail']);

    vi.mocked(cookies).mockResolvedValue(cookieJar('u2:gmail'));
    expect((await render()).props.chosen).toBeNull();
  });

  it('le titre de l’onglet vient de onboarding.tools', async () => {
    expect(await generateMetadata()).toEqual({ title: 'title' });
    expect(getTranslations).toHaveBeenCalledWith('onboarding.tools');
  });
});
