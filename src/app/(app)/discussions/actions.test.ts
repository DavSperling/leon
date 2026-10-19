import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireUserContext } from '@/server/auth/session';
import { createDiscussion, getDiscussion } from '@/server/discussion/discussions';
import { logError } from '@/server/log';
import {
  continueInDiscussionAction,
  newDiscussionAction,
  readDiscussionMessagesAction,
} from './actions';

vi.mock('@/server/auth/session', () => ({ requireUserContext: vi.fn() }));
vi.mock('@/server/discussion/discussions', () => ({
  createDiscussion: vi.fn(),
  getDiscussion: vi.fn(),
}));
vi.mock('@/server/log', () => ({ logError: vi.fn() }));
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
        { id: 'm1', role: 'user', content: 'Q', citations: [citation], createdAt: new Date() },
        {
          id: 'm2',
          role: 'assistant',
          content: 'R [1]',
          citations: [citation],
          createdAt: new Date(),
        },
      ],
    });

    const messages = await readDiscussionMessagesAction(ID);

    expect(getDiscussion).toHaveBeenCalledWith(CTX, ID);
    expect(messages).toEqual([
      { id: 'm1', role: 'user', content: 'Q', citations: [citation] },
      { id: 'm2', role: 'assistant', content: 'R [1]', citations: [citation] },
    ]);
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
