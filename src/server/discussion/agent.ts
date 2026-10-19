import {
  type DiscussionEndReason,
  type DiscussionEvent,
  finalReplyText,
} from '@/lib/discussion-events';
import type { TenantContext } from '@/server/auth/tenant-context';
import type { Embedder } from '@/server/embeddings/embedder';
import { type AgentEvent, type Llm, LlmError } from '@/server/llm/llm';
import { createReferenceFilter, referencedNumbers } from '@/server/llm/references';
import { logError } from '@/server/log';
import { buildDiscussionMessages, DISCUSSION_SYSTEM } from './discussion-prompt';
import { saveReply, startReply } from './discussions';
import {
  createSourceNumbering,
  DISCUSSION_MAX_STEPS,
  DISCUSSION_READ_BUDGET,
  discussionTools,
} from './tools';

export type { DiscussionEvent } from '@/lib/discussion-events';

// L'agent de discussion (T11) : la question entre dans la discussion, l'agent cherche, lit et répond en flux, en
// citant ses sources par leur numéro ; la réponse et ses citations sont gardées à la fin. Il ne voit que ce que
// voit l'utilisateur : ses outils passent par la recherche, sous ses droits (tools.ts).
//
// Une panne (base, modèle, délai) rend l'évènement « indisponible », qui termine le flux : rien de la réponse
// n'est gardé, la question reste et peut être reposée. Elle ne se journalise que par logError, sans question,
// passage ni réponse. Un lecteur qui s'en va interrompt l'appel au modèle, et rien n'est gardé non plus.

// Borne le texte ET la réflexion du modèle (llm.ts) : une réponse de quelques phrases, la réflexion de l'effort
// « medium » entre deux outils. De la marge, pour ne pas couper une réponse.
export const DISCUSSION_MAX_TOKENS = 8000;
// Huit outils et une réponse tiennent largement dans ce délai ; au-delà, l'appel est interrompu.
export const DISCUSSION_TIMEOUT_MS = 180_000;

export function replyStream(
  ctx: TenantContext,
  discussionId: string,
  message: string,
  deps: { llm: Llm | null; embedder: Embedder | null },
): AsyncIterable<DiscussionEvent> | null {
  const { llm } = deps;
  if (llm === null) return null;
  return streamReply(ctx, discussionId, message, llm, deps.embedder);
}

async function* streamReply(
  ctx: TenantContext,
  discussionId: string,
  message: string,
  llm: Llm,
  embedder: Embedder | null,
): AsyncGenerator<DiscussionEvent> {
  let turn: Awaited<ReturnType<typeof startReply>>;
  try {
    turn = await startReply(ctx, discussionId, message);
  } catch (error) {
    logError('discussion.indisponible', error, { etape: 'question' });
    yield { type: 'indisponible' };
    return;
  }
  // Une discussion que l'utilisateur ne voit pas (la route a déjà répondu 404 ; elle a pu disparaître depuis).
  if (turn === null) {
    yield { type: 'indisponible' };
    return;
  }

  const numbering = createSourceNumbering();
  // Les résultats d'où part la discussion prennent les premiers numéros, ceux qu'affiche la question.
  for (const seed of turn.seeds) numbering.number(seed, seed.passageId);
  const tools = discussionTools(ctx, {
    embedder,
    budget: { chars: DISCUSSION_READ_BUDGET },
    numbering,
  });
  const filter = createReferenceFilter(numbering);

  // Le délai interrompt l'appel au modèle (signal), et la lecture n'attend plus rien après lui, même d'un modèle
  // qui ignorerait le signal. Le lecteur qui s'en va l'interrompt aussi (finally).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCUSSION_TIMEOUT_MS);
  const deadline = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(new LlmError('délai dépassé')), {
      once: true,
    });
  });
  deadline.catch(() => undefined);
  let reading: AsyncIterator<AgentEvent> | null = null;
  let text = '';
  let reason: DiscussionEndReason = 'fini';
  // Du texte écrit avant un outil, puis après : deux paragraphes, pas une phrase collée à l'autre.
  let afterTool = false;
  try {
    try {
      reading = llm
        .runAgent({
          step: 'discussion',
          system: DISCUSSION_SYSTEM,
          messages: buildDiscussionMessages(turn.history, turn.seeds),
          tools,
          maxSteps: DISCUSSION_MAX_STEPS,
          maxTokens: DISCUSSION_MAX_TOKENS,
          signal: controller.signal,
        })
        [Symbol.asyncIterator]();
      for (;;) {
        const step = await Promise.race([reading.next(), deadline]);
        if (step.done) break;
        const event = step.value;
        if (event.type === 'outil') {
          afterTool = true;
          yield { type: 'outil', name: event.name };
        } else if (event.type === 'texte') {
          const separator = afterTool && text.trim() !== '' && !text.endsWith('\n') ? '\n\n' : '';
          afterTool = false;
          const delta = filter.push(separator + event.delta);
          if (delta === '') continue;
          text += delta;
          yield { type: 'texte', delta };
        } else {
          reason = event.reason;
          break;
        }
      }
    } catch (error) {
      logError('discussion.indisponible', error, { etape: 'modele' });
      yield { type: 'indisponible' };
      return;
    }
    const rest = filter.flush();
    if (rest !== '') {
      text += rest;
      yield { type: 'texte', delta: rest };
    }

    const content = finalReplyText(text, reason);
    const citations = reason === 'refus' ? [] : numbering.citations(referencedNumbers(content));
    try {
      if (!(await saveReply(ctx, discussionId, { content, citations }))) {
        yield { type: 'indisponible' };
        return;
      }
    } catch (error) {
      logError('discussion.indisponible', error, { etape: 'enregistrement' });
      yield { type: 'indisponible' };
      return;
    }
    yield { type: 'citations', items: citations };
    yield { type: 'fin', reason };
  } finally {
    clearTimeout(timer);
    controller.abort();
    // Le modèle n'est plus lu (fin, panne, délai ou lecteur parti) : on ferme son flux, sans attendre.
    reading?.return?.().catch(() => undefined);
  }
}
