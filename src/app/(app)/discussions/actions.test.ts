import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireUserContext } from '@/server/auth/session';
import { isReplying } from '@/server/discussion/agent';
import { createDiscussion, deleteDiscussion, getDiscussion } from '@/server/discussion/discussions';
import { logError } from '@/server/log';
import {
  continueInDiscussionAction,
  deleteDiscussionAction,
  newDiscussionAction,
  readDiscussionMessagesAction,
} from './actions';

vi.mock('@/server/auth/session', () => ({ requireUserContext: vi.fn() }));
vi.mock('@/server/discussion/discussions', () => ({
  createDiscussion: vi.fn(),
  deleteDiscussion: vi.fn(),
  getDiscussion: vi.fn(),
}));
vi.mock('@/server/discussion/agent', () => ({ isReplying: vi.fn(() => false) }));
vi.mock('@/server/log', () => ({ logError: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));

const CTX = { userId: 'u1', tenantId: 't1' };
const ID = '0b6d2c5e-8f2a-4d56-9a43-3d1f2b6a7c10';
const SOURCE = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

const form = (question: unknown) => {
  const data = new FormData();
  if (typeof question === 'string') data.set('question', question);
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUserContext).mockResolvedValue(CTX as never);
  vi.mocked(createDiscussion).mockResolvedValue(ID);
});

describe('newDiscussionAction', () => {
  it('crée la discussion sous les droits de l’utilisateur, puis l’ouvre', async () => {
    await expect(
      newDiscussionAction({ error: null }, form('  Où en est ACME ?  ')),
    ).rejects.toThrow(`NEXT_REDIRECT /discussions/${ID}`);

    expect(createDiscussion).toHaveBeenCalledWith(CTX, { question: 'Où en est ACME ?' });
  });

  it('refuse une question vide ou trop longue, sans rien créer', async () => {
    for (const question of [undefined, '   ', 'x'.repeat(4001)]) {
      expect(await newDiscussionAction({ error: null }, form(question))).toEqual({
        error: 'Écrivez une question de 4 000 caractères au plus.',
      });
    }

    expect(createDiscussion).not.toHaveBeenCalled();
  });

  // Audit 4 n° 8 : le formulaire envoie chaque retour à la ligne en \r\n ; le champ, qui les compte pour un,
  // laisse passer 4 000 caractères.
  it('accepte une question de 4 000 caractères avec des retours à la ligne envoyés en \\r\\n', async () => {
    const lines = Array.from({ length: 100 }, (_, i) => 'x'.repeat(i === 0 ? 40 : 39));
    const question = lines.join('\r\n');
    expect(lines.join('\n')).toHaveLength(4000);

    await expect(newDiscussionAction({ error: null }, form(question))).rejects.toThrow(
      `NEXT_REDIRECT /discussions/${ID}`,
    );
    expect(createDiscussion).toHaveBeenCalledWith(CTX, { question: lines.join('\n') });
  });

  it('dit un message fixe quand la création échoue, et journalise sans le texte de l’erreur', async () => {
    vi.mocked(createDiscussion).mockRejectedValue(new Error('secret : la question'));

    const state = await newDiscussionAction({ error: null }, form('Question'));

    expect(state.error).toBe('La discussion n’a pas pu être créée. Réessayez dans un instant.');
    expect(JSON.stringify(state)).not.toContain('secret');
    expect(logError).toHaveBeenCalledWith('discussion.creation', expect.any(Error));
  });

  it('ne crée rien sans session valide', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(newDiscussionAction({ error: null }, form('Question'))).rejects.toThrow(
      'NEXT_REDIRECT /connexion',
    );
    expect(createDiscussion).not.toHaveBeenCalled();
  });
});

describe('continueInDiscussionAction', () => {
  it('part de la requête et des résultats de la page', async () => {
    await expect(continueInDiscussionAction('contrat ACME', [SOURCE])).rejects.toThrow(
      `NEXT_REDIRECT /discussions/${ID}`,
    );

    expect(createDiscussion).toHaveBeenCalledWith(CTX, {
      question: 'contrat ACME',
      seedSourceIds: [SOURCE],
    });
  });

  it('refuse ce que le navigateur ne doit pas envoyer, sans rien créer', async () => {
    const tooMany = Array.from({ length: 11 }, () => SOURCE);
    for (const [question, sources] of [
      ['', [SOURCE]],
      ['contrat', 'pas une liste'],
      ['contrat', [3]],
      ['contrat', tooMany],
    ] as const) {
      expect(await continueInDiscussionAction(question as string, sources as never)).toEqual({
        error: 'Cette recherche ne peut pas devenir une discussion.',
      });
    }

    expect(createDiscussion).not.toHaveBeenCalled();
  });
});

// La page d'une discussion relit ses messages avant d'y répondre d'elle-même : la page affichée peut être ancienne
// (retour arrière du navigateur), et la question y avoir déjà sa réponse.
describe('readDiscussionMessagesAction', () => {
  const citation = { n: 1, sourceId: SOURCE, passageId: ID, title: 'T', url: null };

  it('rend les messages de la discussion, sous les droits de l’utilisateur', async () => {
    vi.mocked(getDiscussion).mockResolvedValue({
      discussion: { id: ID, title: 'Q', createdAt: new Date(), updatedAt: new Date() },
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'Q',
          citations: [citation],
          actions: [],
          createdAt: new Date(),
        },
        {
          id: 'm2',
          role: 'assistant',
          content: 'R [1]',
          citations: [citation],
          actions: [],
          createdAt: new Date(),
        },
      ],
    });

    const read = await readDiscussionMessagesAction(ID);

    expect(getDiscussion).toHaveBeenCalledWith(CTX, ID);
    expect(read).toEqual({
      messages: [
        { id: 'm1', role: 'user', content: 'Q', citations: [citation], actions: [] },
        { id: 'm2', role: 'assistant', content: 'R [1]', citations: [citation], actions: [] },
      ],
      replying: false,
    });
  });

  // Audit 2 n° 12 a : la page qui attend une réponse commencée plus tôt s'arrête dès que le serveur n'en a plus.
  // Lu avant les messages : une réponse finie entre les deux lectures y est déjà gardée.
  it('dit si Leon répond encore dans cette discussion, lu avant les messages', async () => {
    vi.mocked(isReplying).mockReturnValueOnce(true);
    vi.mocked(getDiscussion).mockResolvedValue({
      discussion: { id: ID, title: 'Q', createdAt: new Date(), updatedAt: new Date() },
      messages: [
        { id: 'm1', role: 'user', content: 'Q', citations: [], actions: [], createdAt: new Date() },
      ],
    });

    const read = await readDiscussionMessagesAction(ID);

    expect(read?.replying).toBe(true);
    expect(isReplying).toHaveBeenCalledWith(CTX, ID);
    expect(vi.mocked(isReplying).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(getDiscussion).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('rend null pour une discussion invisible, un identifiant qui n’est pas une chaîne, ou une panne', async () => {
    vi.mocked(getDiscussion).mockResolvedValueOnce(null);
    expect(await readDiscussionMessagesAction(ID)).toBeNull();

    expect(await readDiscussionMessagesAction(42 as never)).toBeNull();

    vi.mocked(getDiscussion).mockRejectedValueOnce(new Error('secret'));
    expect(await readDiscussionMessagesAction(ID)).toBeNull();
    expect(logError).toHaveBeenCalledWith('discussion.lecture', expect.any(Error));
  });
});

describe('deleteDiscussionAction', () => {
  it('supprime la discussion de l’utilisateur', async () => {
    vi.mocked(deleteDiscussion).mockResolvedValue(true);
    expect(await deleteDiscussionAction(ID)).toEqual({ ok: true });
    expect(deleteDiscussion).toHaveBeenCalledWith(CTX, ID);
  });

  it('refuse un identifiant qui n’est pas une chaîne, sans toucher la base', async () => {
    expect(await deleteDiscussionAction(42 as never)).toEqual({ ok: false });
    expect(deleteDiscussion).not.toHaveBeenCalled();
  });

  it('une panne ne sort qu’en échec, journalisé', async () => {
    vi.mocked(deleteDiscussion).mockRejectedValue(new Error('base'));
    expect(await deleteDiscussionAction(ID)).toEqual({ ok: false });
    expect(logError).toHaveBeenCalledWith('discussion.suppression', expect.any(Error));
  });
});
