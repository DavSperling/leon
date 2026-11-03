import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComputersSection } from '@/components/verre/reglages/computers';
import { SettingsTabs } from '@/components/verre/reglages/settings-tabs';
import { TokensSection } from '@/components/verre/reglages/tokens';
import { type ApiTokenRow, listApiTokens } from '@/server/auth/api-tokens';
import { installCommand } from '@/server/cli/install-command';
import SettingsPage from './page';

// La page lit beaucoup de choses ; seul le partage des jetons entre « Jetons personnels » et « Ordinateurs connectés »
// se teste ici (S14). Les actions importent Better Auth : les sections ne sont jamais dessinées, seulement bâties.
vi.mock('@/app/(app)/reglages/actions', () => ({}));
vi.mock('@/server/auth/api-tokens', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/auth/api-tokens')>()),
  listApiTokens: vi.fn(),
}));
vi.mock('@/server/auth/session', () => ({
  requireUserContext: vi.fn(async () => ({
    userId: 'u1',
    tenantId: 't1',
    principals: ['u1', 't1'],
  })),
  getSession: vi.fn(async () => ({ user: { name: 'Paul', email: 'paul@example.com' } })),
}));
vi.mock('@/server/auth/members', () => ({
  listMembers: vi.fn(async () => []),
  canInvite: vi.fn(async () => false),
  getMembership: vi.fn(async () => null),
}));
vi.mock('@/server/auth/delete-account', () => ({
  deletionInfo: vi.fn(async () => ({ isOwner: false })),
}));
vi.mock('@/server/briefing/about', () => ({
  ABOUT_MAX_CHARS: 1000,
  readAbout: vi.fn(async () => null),
}));
vi.mock('@/server/cli/install-command', () => ({ installCommand: vi.fn() }));
vi.mock('@/server/env', () => ({ env: { BETTER_AUTH_URL: 'https://leon.example' } }));

const COMMAND = 'curl -fsSL https://leon.example/install | sh';
const token = (id: string, name: string, revokedAt: Date | null = null): ApiTokenRow => ({
  id,
  name,
  hint: 'abcd',
  createdAt: new Date('2026-11-01T10:00:00Z'),
  lastUsedAt: null,
  revokedAt,
});

// Les éléments d'un type donné dans l'arbre que la page rend (fragments compris).
function findAll(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, type));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [
    ...(node.type === type ? [node] : []),
    ...findAll(node.props.children as ReactNode, type),
  ];
}

async function integrations(tokens: ApiTokenRow[]) {
  vi.mocked(listApiTokens).mockResolvedValue(tokens);
  const page = (await SettingsPage()) as ReactElement;
  const [tabs] = findAll(page, SettingsTabs);
  const panels = tabs?.props.panels as Record<string, ReactNode>;
  const tokenProps = findAll(panels.integrations, TokensSection)[0]?.props;
  const computerProps = findAll(panels.integrations, ComputersSection)[0]?.props;
  return {
    tokens: tokenProps?.tokens as { name: string }[] | undefined,
    computers: computerProps?.computers as { name: string }[] | undefined,
    command: computerProps?.command,
  };
}

beforeEach(() => {
  vi.mocked(installCommand).mockReturnValue(COMMAND);
});

describe('page de Réglages : jetons et ordinateurs connectés', () => {
  it('range « Ordinateur : MacBook » dans la section des ordinateurs, pas dans la liste des jetons', async () => {
    const shown = await integrations([
      token('c1', 'Ordinateur : MacBook'),
      token('t1', 'Mon script'),
    ]);

    expect(shown.computers?.map((c) => c.name)).toEqual(['MacBook']);
    expect(shown.tokens?.map((t) => t.name)).toEqual(['Mon script']);
  });

  it('donne à la section la commande d’installation', async () => {
    expect((await integrations([])).command).toBe(COMMAND);

    vi.mocked(installCommand).mockReturnValue(null);
    expect((await integrations([])).command).toBeNull();
  });

  it('un ordinateur révoqué disparaît des deux listes', async () => {
    const shown = await integrations([
      token('c1', 'Ordinateur : MacBook', new Date('2026-11-02T10:00:00Z')),
      token('t1', 'Mon script', new Date('2026-11-02T10:00:00Z')),
    ]);

    expect(shown.computers).toEqual([]);
    expect(shown.tokens).toEqual([]);
  });

  // shortcut: les ordinateurs sont reconnus au préfixe du nom, un jeton manuel qui le porte s'y range.
  it('ne reconnaît que le préfixe : « Mon Ordinateur : x » reste un jeton', async () => {
    const shown = await integrations([token('t1', 'Mon Ordinateur : x')]);

    expect(shown.computers).toEqual([]);
    expect(shown.tokens?.map((t) => t.name)).toEqual(['Mon Ordinateur : x']);
  });
});
