import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSession, requireUserContext, signOutCurrentUser } from '@/server/auth/session';
import { logError } from '@/server/log';
import { fetchPassageContext } from '@/server/search/context';
import { searchShell } from '@/server/shell/shell';
import { previewPassageAction, searchShellAction, signOutAction } from './actions';

vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  requireUserContext: vi.fn(),
  signOutCurrentUser: vi.fn(),
}));
vi.mock('@/server/search/context', () => ({ fetchPassageContext: vi.fn() }));
vi.mock('@/server/shell/shell', () => ({
  NOTHING_FOUND: { tools: [], people: [], documents: [], discussions: [] },
  searchShell: vi.fn(),
}));
vi.mock('@/server/log', () => ({ logError: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));

const CTX = { userId: 'u1', tenantId: 't1' };
const PASSAGE = '0b6d2c5e-8f2a-4d56-9a43-3d1f2b6a7c10';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUserContext).mockResolvedValue(CTX as never);
  vi.mocked(getSession).mockResolvedValue({ user: { id: 'u1' } } as never);
});

describe('signOutAction', () => {
  it('ferme la session puis renvoie à la connexion', async () => {
    await expect(signOutAction()).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(signOutCurrentUser).toHaveBeenCalledOnce();
  });

  it('déconnecte une session sans organisation, sans passer par /bienvenue', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /bienvenue'));

    await expect(signOutAction()).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(requireUserContext).not.toHaveBeenCalled();
    expect(signOutCurrentUser).toHaveBeenCalledOnce();
  });

  it('ne ferme rien sans session valide', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await expect(signOutAction()).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(signOutCurrentUser).not.toHaveBeenCalled();
  });
});

describe('previewPassageAction', () => {
  const context = {
    source: {
      sourceId: 's1',
      kind: 'fathom' as const,
      nature: 'reunion' as const,
      title: 'Call ACME',
      url: 'https://fathom.video/calls/1',
      origin: {},
      lastTs: new Date('2026-10-12T10:00:00Z'),
    },
    turns: [
      {
        turnId: 't1',
        role: 'participant' as const,
        authorName: 'Bob',
        ts: new Date('2026-10-12T10:00:00Z'),
        text: 'Bonjour',
        isHit: true,
      },
    ],
  };

  it('rend l’aperçu du passage sous les droits de l’utilisateur connecté, comme la recherche', async () => {
    vi.mocked(fetchPassageContext).mockResolvedValue(context);

    const result = await previewPassageAction(PASSAGE);

    expect(fetchPassageContext).toHaveBeenCalledWith({ ...CTX, equipe: true }, PASSAGE);
    expect(result).toMatchObject({
      ok: true,
      preview: {
        kindLabel: 'Fathom',
        title: 'Call ACME',
        turns: [{ speaker: 'Bob', isHit: true }],
      },
    });
  });

  it('dit « introuvable » pour un passage invisible ou inconnu, sans rien d’autre', async () => {
    vi.mocked(fetchPassageContext).mockResolvedValue(null);

    expect(await previewPassageAction(PASSAGE)).toEqual({ ok: false, reason: 'introuvable' });
  });

  it('ne lit rien quand l’identifiant n’est pas un uuid', async () => {
    for (const bad of [undefined, null, 42, {}, ['x'], 'pas-un-uuid', `${PASSAGE}x`]) {
      expect(await previewPassageAction(bad as never)).toEqual({
        ok: false,
        reason: 'introuvable',
      });
    }

    expect(fetchPassageContext).not.toHaveBeenCalled();
  });

  it('répond « erreur » à une panne, journalise sans le texte de l’erreur, et ne la laisse pas sortir', async () => {
    vi.mocked(fetchPassageContext).mockRejectedValue(new Error('secret : texte de la requête'));

    const result = await previewPassageAction(PASSAGE);

    expect(result).toEqual({ ok: false, reason: 'erreur' });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(logError).toHaveBeenCalledWith('search.preview_failed', expect.any(Error));
  });

  it('ne lit rien sans session valide', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(previewPassageAction(PASSAGE)).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(fetchPassageContext).not.toHaveBeenCalled();
  });
});

describe('searchShellAction', () => {
  const NOTHING = { tools: [], people: [], documents: [], discussions: [] };
  const found = { ...NOTHING, people: [{ id: 'm1', name: 'Karim Benali', image: null }] };

  it('cherche sous les droits de la personne connectée', async () => {
    vi.mocked(searchShell).mockResolvedValue(found);

    expect(await searchShellAction('karim')).toEqual(found);

    expect(searchShell).toHaveBeenCalledWith(CTX, 'karim');
  });

  it('ne lit rien quand la requête n’est pas un texte', async () => {
    for (const bad of [undefined, null, 42, {}, ['karim']]) {
      expect(await searchShellAction(bad as never)).toEqual(NOTHING);
    }

    expect(searchShell).not.toHaveBeenCalled();
  });

  it('ne trouve rien pendant une panne, la journalise, et ne la laisse pas sortir', async () => {
    vi.mocked(searchShell).mockRejectedValue(new Error('secret : titre d’un document'));

    const result = await searchShellAction('karim');

    expect(result).toEqual(NOTHING);
    expect(logError).toHaveBeenCalledWith('shell.search_failed', expect.any(Error));
  });

  it('ne lit rien sans session valide', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(searchShellAction('karim')).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(searchShell).not.toHaveBeenCalled();
  });
});
