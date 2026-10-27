'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import type { ActionView } from '@/lib/actions';
import { DISCUSSION_MESSAGE_MAX_CHARS, type DiscussionCitation } from '@/lib/discussion-events';
import { PAGE_SIZE } from '@/lib/search-limits';
import { requireUserContext } from '@/server/auth/session';
import type { TenantContext } from '@/server/auth/tenant-context';
import { isReplying } from '@/server/discussion/agent';
import { createDiscussion, deleteDiscussion, getDiscussion } from '@/server/discussion/discussions';
import { decideAction } from '@/server/discussion/proposed-actions';
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
  // Les actions proposées pendant cette réponse, chacune avec son bouton.
  actions: ActionView[];
};

export type NewDiscussionState = { error: string | null };

// Un formulaire envoie chaque retour à la ligne en \r\n, que le champ compte pour un caractère : ramené à \n
// avant de compter, sans quoi une question que le champ accepte serait refusée.
const QuestionSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.replaceAll('\r\n', '\n') : value),
  z.string().trim().min(1).max(DISCUSSION_MESSAGE_MAX_CHARS),
);
const SourceIdsSchema = z.array(z.string().max(64)).max(PAGE_SIZE);

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
  const t = await getTranslations('discussions');
  const question = QuestionSchema.safeParse(formData.get('question'));
  if (!question.success) return { error: t('questionTooLong') };
  const id = await create(ctx, { question: question.data });
  if (id === null) return { error: t('createFailed') };
  redirect(`/discussions/${id}`);
}

export async function continueInDiscussionAction(
  query: string,
  sourceIds: string[],
): Promise<{ error: string }> {
  const ctx = await requireUserContext();
  const t = await getTranslations('discussions');
  const question = QuestionSchema.safeParse(query);
  const seeds = SourceIdsSchema.safeParse(sourceIds);
  if (!question.success || !seeds.success) {
    return { error: t('continueUnavailable') };
  }
  const id = await create(ctx, { question: question.data, seedSourceIds: seeds.data });
  if (id === null) return { error: t('createFailed') };
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
    const messages = found.messages.map(({ id, role, content, citations, actions }) => ({
      id,
      role,
      content,
      citations,
      actions,
    }));
    return { messages, replying };
  } catch (error) {
    logError('discussion.lecture', error);
    return null;
  }
}

// Supprimer une de ses discussions, depuis la liste. Faux pour une discussion inconnue ou d'un autre, ou une panne.
export async function deleteDiscussionAction(discussionId: string): Promise<{ ok: boolean }> {
  const ctx = await requireUserContext();
  if (typeof discussionId !== 'string') return { ok: false };
  try {
    const ok = await deleteDiscussion(ctx, discussionId);
    revalidatePath('/discussions');
    return { ok };
  } catch (error) {
    logError('discussion.suppression', error);
    return { ok: false };
  }
}

// Confirmer ou annuler une action que Leon a proposée (lot 7 de la spec GitHub). Seule une action de l'utilisateur,
// encore proposée et pas expirée, change ; la confirmation l'exécute avec sa propre connexion. Null pour une action
// inconnue ou d'un autre, ou une panne.
export async function decideActionAction(
  actionId: string,
  decision: 'confirmer' | 'annuler',
): Promise<ActionView | null> {
  const ctx = await requireUserContext();
  if (typeof actionId !== 'string' || (decision !== 'confirmer' && decision !== 'annuler'))
    return null;
  try {
    const action = await decideAction(ctx, actionId, decision);
    if (!action) return null;
    const { createdAt: _at, ...view } = action;
    return view;
  } catch (error) {
    logError('action.decision', error);
    return null;
  }
}
