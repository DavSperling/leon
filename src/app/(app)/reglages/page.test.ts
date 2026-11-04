import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantsSection } from '@/components/verre/reglages/assistants';
import { ComputersSection } from '@/components/verre/reglages/computers';
import { SettingsTabs } from '@/components/verre/reglages/settings-tabs';
import { TokensSection } from '@/components/verre/reglages/tokens';
import { type ApiTokenRow, listApiTokens } from '@/server/auth/api-tokens';
import { claudeCodeInstructions, installCommand } from '@/server/cli/install-command';
import { RESOURCE } from '@/server/oauth/metadata';
import SettingsPage from './page';

// La page lit beaucoup de choses ; seul le partage des jetons entre « Jetons personnels », « Ordinateurs connectés » et
// « Assistants connectés » se teste ici (S14, M08), par la sorte (`kind`) de chaque jeton. Les actions importent Better Auth : les sections ne sont jamais dessinées, seulement bâties.
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
vi.mock('@/server/cli/install-command', () => ({
  installCommand: vi.fn(),
  claudeCodeInstructions: vi.fn(),
}));
vi.mock('@/server/connectors/github/depots-equipe', () => ({
  listDepotsEquipe: vi.fn(async () => ({ depots: [], githubBranche: false })),
}));
vi.mock('@/server/env', () => ({ env: { BETTER_AUTH_URL: 'https://leon.example' } }));

const DAY_MS = 24 * 60 * 60 * 1000;
const COMMAND = 'curl -fsSL https://leon.example/install | sh';
const INSTRUCTIONS = `Install Leon: ${COMMAND}`;
const token = (
  id: string,
  name: string,
  kind: ApiTokenRow['kind'] = 'manuel',
  revokedAt: Date | null = null,
  refreshExpiresAt: Date | null = kind === 'assistant' ? new Date(Date.now() + DAY_MS) : null,
): ApiTokenRow => ({
  id,
  name,
  hint: 'abcd',
  createdAt: new Date('2026-11-01T10:00:00Z'),
  lastUsedAt: null,
  revokedAt,
  kind,
  clientName: kind === 'assistant' ? name : null,
  clientHost: kind === 'assistant' ? 'claude.ai' : null,
  refreshExpiresAt,
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
  const assistantProps = findAll(panels.integrations, AssistantsSection)[0]?.props;
  return {
    tokens: tokenProps?.tokens as { name: string }[] | undefined,
    computers: computerProps?.computers as { name: string }[] | undefined,
    assistants: assistantProps?.assistants as { name: string }[] | undefined,
    address: assistantProps?.address,
    command: computerProps?.command,
    instructions: computerProps?.instructions,
  };
}

beforeEach(() => {
  vi.mocked(installCommand).mockReturnValue(COMMAND);
  vi.mocked(claudeCodeInstructions).mockReturnValue(INSTRUCTIONS);
});

describe('page de Réglages : jetons, ordinateurs et assistants connectés', () => {
  it('range « Ordinateur : MacBook » dans la section des ordinateurs, pas dans la liste des jetons', async () => {
    const shown = await integrations([
      token('c1', 'Ordinateur : MacBook', 'ordinateur'),
      token('t1', 'Mon script'),
    ]);

    expect(shown.computers?.map((c) => c.name)).toEqual(['MacBook']);
    expect(shown.tokens?.map((t) => t.name)).toEqual(['Mon script']);
  });

  it('range un jeton assistant dans la section des assistants, ni dans les jetons ni dans les ordinateurs', async () => {
    const shown = await integrations([
      token('a1', 'Claude', 'assistant'),
      token('c1', 'Ordinateur : MacBook', 'ordinateur'),
      token('t1', 'Mon script'),
    ]);

    expect(shown.assistants?.map((a) => a.name)).toEqual(['Claude']);
    expect(shown.computers?.map((c) => c.name)).toEqual(['MacBook']);
    expect(shown.tokens?.map((t) => t.name)).toEqual(['Mon script']);
  });

  // Claude compare l'adresse collée à la ressource des métadonnées : la page montre RESOURCE, pas une adresse recomposée.
  it('donne à la section des assistants l’adresse du MCP, celle des métadonnées', async () => {
    const shown = await integrations([]);

    expect(shown.address).toBe('https://leon.example/api/mcp');
    expect(shown.address).toBe(RESOURCE);
  });

  it('ne montre plus la commande à jeton de « Brancher Claude Code »', async () => {
    const page = (await SettingsPage()) as ReactElement;
    const [tabs] = findAll(page, SettingsTabs);
    const props = JSON.stringify(tabs?.props.panels, (_, value) =>
      typeof value === 'function' ? undefined : value,
    );

    expect(props).not.toContain('--header');
    expect(props).not.toContain('Les outils de Leon dans Claude Code');
    expect(props).not.toContain('"claude-code"');
  });

  it('donne à la section la commande d’installation et la consigne de Claude Code', async () => {
    const shown = await integrations([]);
    expect(shown.command).toBe(COMMAND);
    expect(shown.instructions).toBe(INSTRUCTIONS);
    expect(claudeCodeInstructions).toHaveBeenCalledWith(expect.any(Function));

    vi.mocked(installCommand).mockReturnValue(null);
    vi.mocked(claudeCodeInstructions).mockReturnValue(null);
    const refused = await integrations([]);
    expect(refused.command).toBeNull();
    expect(refused.instructions).toBeNull();
  });

  it('un jeton révoqué disparaît des trois listes', async () => {
    const revoked = new Date('2026-11-02T10:00:00Z');
    const shown = await integrations([
      token('c1', 'Ordinateur : MacBook', 'ordinateur', revoked),
      token('t1', 'Mon script', 'manuel', revoked),
      token('a1', 'Claude', 'assistant', revoked),
    ]);

    expect(shown.computers).toEqual([]);
    expect(shown.tokens).toEqual([]);
    expect(shown.assistants).toEqual([]);
  });

  // Un assistant dont le renouvellement a expiré ne se reconnectera plus : il ne reste dans la liste qu'en apparence.
  it('ne montre un assistant que si son renouvellement n’a pas expiré', async () => {
    const shown = await integrations([
      token('a1', 'Claude', 'assistant', null, new Date(Date.now() - 1000)),
      token('a2', 'ChatGPT', 'assistant', null, new Date(Date.now() + DAY_MS)),
      token('a3', 'Cursor', 'assistant', null, null),
    ]);

    expect(shown.assistants?.map((a) => a.name)).toEqual(['ChatGPT']);
  });

  // La sorte vient de la colonne `kind`, plus du préfixe du nom : un jeton manuel qui porte le préfixe reste un jeton.
  it('range par la sorte, pas par le nom : « Ordinateur : x » créé à la main reste un jeton', async () => {
    const shown = await integrations([
      token('t1', 'Ordinateur : x'),
      token('t2', 'Claude', 'manuel'),
    ]);

    expect(shown.computers).toEqual([]);
    expect(shown.assistants).toEqual([]);
    expect(shown.tokens?.map((t) => t.name)).toEqual(['Ordinateur : x', 'Claude']);
  });
});
