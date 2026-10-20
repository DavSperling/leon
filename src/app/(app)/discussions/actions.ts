'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { DISCUSSION_MESSAGE_MAX_CHARS, type DiscussionCitation } from '@/lib/discussion-events';
import { PAGE_SIZE } from '@/lib/search-limits';
import { requireUserContext } from '@/server/auth/session';
import type { TenantContext } from '@/server/auth/tenant-context';
import { isReplying } from '@/server/discussion/agent';
import { createDiscussion, getDiscussion } from '@/server/discussion/discussions';
import { logError } from '@/server/log';

// Ouvrir une discussion : depuis la page Discussions (une question), ou depuis la réponse en tête de la barre
// (« Continuer en discussion » : la requête et les résultats affichés) ; relire ses messages. Ce sont des points
// d'entrée publics : rien de ce que le navigateur envoie n'est cru, et une panne ne sort qu'en message fixe.

// Un message tel que la page d'une discussion l'affiche.
export type DiscussionMessageView = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: DiscussionCitation[];
};

export type NewDiscussionState = { error: string | null };

const QuestionSchema = z.string().trim().min(1).max(DISCUSSION_MESSAGE_MAX_CHARS);
const SourceIdsSchema = z.array(z.string().max(64)).max(PAGE_SIZE);

const FAILED = 'La discussion n’a pas pu être créée. Réessayez dans un instant.';

async function create(
  ctx: TenantContext,
  input: Parameters<typeof createDiscussion>[1],
): Promise<string | null> {
  try {
    return await createDiscussion(ctx, input);
  } catch (error) {
    logError('discussion.creation', error);
    return null;
  }
}

export async function newDiscussionAction(
  _previous: NewDiscussionState,
  formData: FormData,
): Promise<NewDiscussionState> {
  const ctx = await requireUserContext();
  const question = QuestionSchema.safeParse(formData.get('question'));
  if (!question.success) return { error: 'Écrivez une question de 4 000 caractères au plus.' };
  const id = await create(ctx, { question: question.data });
  if (id === null) return { error: FAILED };
  redirect(`/discussions/${id}`);
}

export async function continueInDiscussionAction(
  query: string,
  sourceIds: string[],
): Promise<{ error: string }> {
  const ctx = await requireUserContext();
  const question = QuestionSchema.safeParse(query);
  const seeds = SourceIdsSchema.safeParse(sourceIds);
  if (!question.success || !seeds.success) {
    return { error: 'Cette recherche ne peut pas devenir une discussion.' };
  }
  const id = await create(ctx, { question: question.data, seedSourceIds: seeds.data });
  if (id === null) return { error: FAILED };
  redirect(`/discussions/${id}`);
}

// Les messages d'une discussion de l'utilisateur, relus au moment où la page veut y répondre d'elle-même : la page
// affichée peut être ancienne (retour arrière du navigateur) et la question avoir déjà sa réponse. `replying` : Leon
// y répond encore, lu avant les messages (une réponse finie entre les deux y est déjà gardée). Null pour une
// discussion qu'il ne voit pas, ou une panne.
export async function readDiscussionMessagesAction(
  discussionId: string,
): Promise<{ messages: DiscussionMessageView[]; replying: boolean } | null> {
  const ctx = await requireUserContext();
  if (typeof discussionId !== 'string') return null;
  try {
    const replying = isReplying(ctx, discussionId);
    const found = await getDiscussion(ctx, discussionId);
    if (!found) return null;
    const messages = found.messages.map(({ id, role, content, citations }) => ({
      id,
      role,
      content,
      citations,
    }));
    return { messages, replying };
  } catch (error) {
    logError('discussion.lecture', error);
    return null;
  }
}
