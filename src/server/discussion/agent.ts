import type { ActionView } from '@/lib/actions';
import {
  DISCUSSION_TIMEOUT_MS,
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
// n'est gardé ; la question reste et peut être reposée, sauf si elle n'a pas pu être écrite (questionGardee). Elle ne se journalise que par logError, sans question,
// passage ni réponse. La route continue de lire le flux quand la page s'en va : la réponse est finie et gardée.
// Un flux qu'on cesse de lire interrompt l'appel au modèle, et rien n'est gardé.
//
// Une seule réponse à la fois par discussion : une demande qui arrive pendant une réponse (la page quittée puis
// rouverte, un second onglet) rend « en-cours », sans écrire sa question ni appeler le modèle. Et au plus deux
// réponses en cours par utilisateur (son coût) : au-delà, replyStream rend 'trop' (la route répond 429), sans rien
// écrire. Ces gardes vivent dans ce processus (une seule instance de Leon) ; sur plusieurs, la base refuse
// toujours une seconde réponse à la même question (saveReply), qui rend alors « en-cours » elle aussi.

// Borne le texte ET la réflexion du modèle (llm.ts) : une réponse de quelques phrases, la réflexion de l'effort
// « medium » entre deux outils. De la marge, pour ne pas couper une réponse.
export const DISCUSSION_MAX_TOKENS = 8000;

// Les réponses en cours d'un utilisateur, toutes discussions confondues.
export const DISCUSSION_MAX_REPLIES_PER_USER = 2;

// Les discussions où une réponse est en cours, par utilisateur (`userId:discussionId`) : celle d'un autre ne
// bloque jamais la sienne. Rangé sur globalThis : dans l'appli compilée, la route et l'action de la page
// (isReplying) sont dans deux paquets de Next, chacun avec sa copie de ce module (audit 3 n° 12).
const REPLYING = Symbol.for('leon.discussion.replying');
const shared = globalThis as typeof globalThis & { [REPLYING]?: Set<string> };
shared[REPLYING] ??= new Set<string>();
const replying = shared[REPLYING];

// Une réponse de Leon est en cours, dans ce processus, pour cet utilisateur dans cette discussion : la page qui
// attend une réponse commencée plus tôt (« en-cours ») cesse d'attendre dès qu'il n'y en a plus.
export function isReplying(ctx: TenantContext, discussionId: string): boolean {
  return replying.has(`${ctx.userId}:${discussionId}`);
}

export function replyStream(
  ctx: TenantContext,
  discussionId: string,
  message: string,
  deps: { llm: Llm | null; embedder: Embedder | null },
): AsyncIterable<DiscussionEvent> | null | 'trop' {
  const { llm } = deps;
  if (llm === null) return null;
  const key = `${ctx.userId}:${discussionId}`;
  if (replying.has(key)) return alreadyReplying();
  const mine = [...replying].filter((k) => k.startsWith(`${ctx.userId}:`)).length;
  if (mine >= DISCUSSION_MAX_REPLIES_PER_USER) return 'trop';
  // Prise ici, d'un bloc avec le contrôle, avant toute écriture ; rendue quand le flux finit, pour toute raison
  // (finally). La route lit toujours le flux jusqu'au bout, même après le départ du lecteur.
  replying.add(key);
  return streamReply(ctx, discussionId, message, llm, deps.embedder, key);
}

async function* alreadyReplying(): AsyncGenerator<DiscussionEvent> {
  yield { type: 'en-cours' };
}

async function* streamReply(
  ctx: TenantContext,
  discussionId: string,
  message: string,
  llm: Llm,
  embedder: Embedder | null,
  key: string,
): AsyncGenerator<DiscussionEvent> {
  try {
    yield* runReply(ctx, discussionId, message, llm, embedder);
  } finally {
    replying.delete(key);
  }
}

async function* runReply(
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
    yield { type: 'indisponible', questionGardee: false };
    return;
  }
  // Une discussion que l'utilisateur ne voit pas (la route a déjà répondu 404 ; elle a pu disparaître depuis).
  if (turn === null) {
    yield { type: 'indisponible', questionGardee: false };
    return;
  }

  const numbering = createSourceNumbering();
  // Les résultats d'où part la discussion prennent les premiers numéros, ceux qu'affiche la question.
  for (const seed of turn.seeds) numbering.number(seed, seed.passageId, { n: seed.n });
  // Les actions que les outils proposent pendant la réponse : montrées à la fin, chacune avec son bouton.
  const proposed: ActionView[] = [];
  const tools = discussionTools(ctx, {
    embedder,
    budget: { chars: DISCUSSION_READ_BUDGET },
    numbering,
    discussionId,
    onAction: (action) => proposed.push(action),
  });
  const filter = createReferenceFilter(numbering);

  // Le délai (DISCUSSION_TIMEOUT_MS : huit outils et une réponse y tiennent largement) interrompt l'appel au modèle
  // (signal), et la lecture n'attend plus rien après lui, même d'un modèle qui ignorerait le signal. Le lecteur qui
  // cesse de lire le flux l'interrompt aussi (finally).
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
      yield { type: 'indisponible', questionGardee: true };
      return;
    }
    const rest = filter.flush();
    if (rest !== '') {
      text += rest;
      yield { type: 'texte', delta: rest };
    }

    const content = finalReplyText(text, reason);
    const citations = reason === 'refus' ? [] : numbering.citations(referencedNumbers(content));
    let saved: Awaited<ReturnType<typeof saveReply>>;
    try {
      saved = await saveReply(ctx, discussionId, {
        questionId: turn.questionId,
        content,
        citations,
      });
    } catch (error) {
      logError('discussion.indisponible', error, { etape: 'enregistrement' });
      yield { type: 'indisponible', questionGardee: true };
      return;
    }
    // Une autre réponse à cette question a été gardée entre-temps (depuis un autre serveur) : c'est elle qui compte.
    if (saved !== 'gardee') {
      // Invisible : la discussion a disparu entre-temps, avec sa question.
      yield saved === 'deja-repondue'
        ? { type: 'en-cours' }
        : { type: 'indisponible', questionGardee: false };
      return;
    }
    if (proposed.length > 0) yield { type: 'actions', items: proposed };
    yield { type: 'citations', items: citations };
    yield { type: 'fin', reason };
  } finally {
    clearTimeout(timer);
    controller.abort();
    // Le modèle n'est plus lu (fin, panne, délai ou flux plus lu) : on ferme son flux, sans attendre.
    reading?.return?.().catch(() => undefined);
  }
}
