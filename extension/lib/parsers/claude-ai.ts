import {
  COMPRESSED,
  decompress,
  END_STREAM,
  envelopeReader,
  intOf,
  messageOf,
  type ProtoField,
  readFields,
  textOf,
} from '../connect-proto';
import type { ObservedCall, StreamParser } from './site-parser';

// claude.ai, relevé le 20/11/2026 (protocole Connect, protobuf) : le message de la personne part dans un
// PerformAction, la réponse arrive sur un autre appel, StreamTimeline, un flux qui peut rester ouvert sans fin.
// Le chemin vaut quel que soit le service (anthropic.bard.api.v1alpha.ConversationService) : s'il change de
// version, on veut un rejet visible, pas un silence.
const RPC_PATH = /^\/claudeai-rpc\/[^/]+\/(PerformAction|StreamTimeline)$/;

const PENDING_MAX = 20;
const PENDING_TTL_MS = 15 * 60 * 1000;
// Étapes de texte et blocs gardés par envoi.
const RECORDS_MAX = 32;
const ID_MAX = 200;
const TEXT_MAX = 200_000;

// Un envoi vu sur cette page, en attente de sa réponse : ses étapes de texte, et le texte de ses blocs terminés dans
// leur ordre d'arrivée. at : la dernière activité ; overflow : une étape ou un bloc refusé à la borne ; reported : un
// rejet format l'a déjà signalé.
type Pending = {
  conversationId: string;
  userId: string;
  userText: string;
  at: number;
  textSteps: Set<string>;
  blocks: Map<string, string>;
  overflow: boolean;
  reported: boolean;
};

type Report = ObservedCall['report'];

function idOf(fields: ProtoField[], field: number): string | null {
  const id = textOf(fields, field);
  return id !== null && id.length > 0 && id.length <= ID_MAX ? id : null;
}

// Tout ce qui vient du site est hostile : Map plutôt qu'objets (monde MAIN), tailles bornées, rien d'évalué.
export function createClaudeAiParser(now: () => Date = () => new Date()) {
  // Par identifiant de la réponse attendue (2.2 de l'envoi).
  const pending = new Map<string, Pending>();
  // Un flux devenu illisible ne livrera plus de réponse : on le dit à chaque envoi vu, jusqu'à ce qu'un flux se
  // relise (sinon l'incomplet de l'envoi perdu effacerait la panne dans la petite fenêtre).
  let streamLost = false;

  // Rien reçu depuis 15 minutes pour une attente : la réponse n'est jamais arrivée au bout (arrêt, départ de la page,
  // panne). Un envoi déjà rejeté comme format sort sans second rejet.
  function expire(report: Report): void {
    const limit = now().getTime() - PENDING_TTL_MS;
    for (const [replyId, send] of pending) {
      if (send.at > limit) continue;
      pending.delete(replyId);
      if (!send.reported) report({ rejected: 'incomplet' });
    }
  }

  // L'envoi : 1.2 la conversation, 2.1 le message de la personne, 2.2 la réponse attendue, 2.3 son texte. Sans texte
  // en 2.3 (préparation, petit appel 15.1, régénération), rien à capter. Rend l'identifiant de la réponse attendue.
  async function readSend(call: ObservedCall): Promise<string | null> {
    const raw = await call.request.body;
    const encoding = call.request.headers.get('content-encoding');
    const body = raw === null || encoding === null ? raw : await decompress(raw, encoding);
    const root = body === null ? null : readFields(body);
    const action = root && messageOf(root, 2);
    // Un corps qui ne se lit pas : on ne sait plus reconnaître un envoi, la panne muette qu'on veut voir.
    if (!root || !action) {
      call.report({ rejected: 'format' });
      return null;
    }
    const userText = textOf(action, 3);
    if (!userText) return null;
    const head = messageOf(root, 1);
    const conversationId = head && idOf(head, 2);
    const userId = idOf(action, 1);
    const replyId = idOf(action, 2);
    if (!conversationId || !userId || !replyId) {
      call.report({ rejected: 'format' });
      return null;
    }
    const send: Pending = {
      conversationId,
      userId,
      userText: userText.slice(0, TEXT_MAX),
      at: now().getTime(),
      textSteps: new Set(),
      blocks: new Map(),
      overflow: false,
      reported: streamLost,
    };
    pending.set(replyId, send);
    if (streamLost) call.report({ rejected: 'format' });
    const oldest = pending.keys().next().value;
    if (pending.size > PENDING_MAX && oldest !== undefined) pending.delete(oldest);
    return replyId;
  }

  // 1.1.4 : une étape d'un message attendu ; seules les étapes de texte (sorte 1) comptent, jamais les réflexions.
  function readStep(fields: ProtoField[]): void {
    const messageId = idOf(fields, 2);
    const send = messageId === null ? undefined : pending.get(messageId);
    const stepId = idOf(fields, 1);
    if (!send || !stepId || intOf(fields, 4) !== 1 || send.textSteps.has(stepId)) return;
    if (send.textSteps.size < RECORDS_MAX) send.textSteps.add(stepId);
    else send.overflow = true;
  }

  // 1.1.5 : un bloc d'une étape de texte, terminé (4=1), son texte cumulé en 9.
  function readBlock(fields: ProtoField[]): void {
    const stepId = idOf(fields, 2);
    const blockId = idOf(fields, 1);
    const text = intOf(fields, 4) === 1 ? textOf(fields, 9) : null;
    if (stepId === null || blockId === null || !text) return;
    for (const send of pending.values()) {
      if (!send.textSteps.has(stepId)) continue;
      if (send.blocks.has(blockId) || send.blocks.size < RECORDS_MAX) {
        send.blocks.set(blockId, text.slice(0, TEXT_MAX));
      } else {
        send.overflow = true;
      }
      return;
    }
  }

  // 1.1.3 : un message. La réponse attendue est finie quand elle arrive d'auteur 2 avec 6=1 ; en cours, elle arrive
  // d'abord sans 6.
  function readMessage(fields: ProtoField[], report: Report): void {
    const replyId = idOf(fields, 1);
    const send = replyId === null ? undefined : pending.get(replyId);
    if (!send || replyId === null || intOf(fields, 3) !== 2 || intOf(fields, 6) !== 1) return;
    pending.delete(replyId);
    // Des étapes ou des blocs refusés à la borne : jamais un texte coupé rendu comme s'il était complet.
    if (send.overflow) {
      report({ rejected: 'incomplet' });
      return;
    }
    const text = [...send.blocks.values()].join('\n\n');
    // On a reconnu la fin, mais pas son texte.
    if (text === '') {
      report({ rejected: 'format' });
      return;
    }
    const ts = now().toISOString();
    report({
      site: 'claude_ai',
      conversationId: send.conversationId,
      title: null,
      user: { messageId: send.userId, text: send.userText, ts },
      assistant: { messageId: replyId, text, ts },
    });
  }

  // Un événement du flux : seule compte une mise à jour (1.1). Les morceaux (1.2) sont sautés : le bloc terminé
  // porte déjà tout le texte. Rend false s'il ne se lit pas.
  function readEvent(fields: ProtoField[], report: Report): boolean {
    const event = messageOf(fields, 1);
    // Un morceau n'arrive que pendant qu'une réponse s'écrit : les 15 minutes repartent.
    // shortcut: un morceau rafraîchit toutes les attentes de la page, à cibler par bloc si plusieurs réponses en
    // parallèle sur une page deviennent un cas réel.
    if (event?.some(({ field }) => field === 2)) {
      for (const send of pending.values()) send.at = now().getTime();
    }
    const update = event && messageOf(event, 1);
    if (!update) return false;
    // Étapes, puis blocs, puis messages : un message terminé peut arriver dans la même enveloppe que son bloc.
    // Le gros objet 1.1.2 n'est jamais ouvert.
    for (const kind of [4, 5, 3]) {
      for (const { field, value } of update) {
        if (field !== kind) continue;
        const record = value instanceof Uint8Array ? readFields(value) : null;
        if (record === null) return false;
        if (kind === 4) readStep(record);
        else if (kind === 5) readBlock(record);
        else readMessage(record, report);
      }
    }
    return true;
  }

  // Un flux StreamTimeline, enveloppe par enveloppe, sans rien garder au-delà de celle en cours. Un flux illisible :
  // un seul rejet s'il y a des envois en attente, puis on cesse de le lire ; les envois suivants le rediront (on ne
  // juge pas l'historique, mais la réponse ne viendra pas par ce flux).
  async function readTimeline(call: ObservedCall): Promise<void> {
    const response = await call.response;
    if (response === null) return;
    const unreadable = () => {
      streamLost = true;
      if (pending.size === 0) return;
      call.report({ rejected: 'format' });
      for (const send of pending.values()) send.reported = true;
    };
    if (!response.headers.get('content-type')?.startsWith('application/connect+proto')) {
      return unreadable();
    }
    const encoding = response.headers.get('connect-content-encoding');
    const nextEnvelopes = envelopeReader();
    for await (const chunk of response.chunks) {
      const envelopes = nextEnvelopes(chunk);
      if (envelopes === null) return unreadable();
      for (const { flags, message } of envelopes) {
        // La fin de flux est du JSON : rien à y lire.
        if (flags & END_STREAM) continue;
        const bytes = flags & COMPRESSED ? await decompress(message, encoding) : message;
        const fields = bytes === null ? null : readFields(bytes);
        if (fields === null || !readEvent(fields, call.report)) return unreadable();
        streamLost = false;
        expire(call.report);
      }
    }
  }

  return {
    site: 'claude_ai',
    matchesRequest: (url, method) => method === 'POST' && RPC_PATH.test(url.pathname),
    async observe(call) {
      expire(call.report);
      if (!call.url.pathname.endsWith('/PerformAction')) return readTimeline(call);
      const replyId = await readSend(call);
      // L'appel a échoué (refus, panne) : aucune réponse ne viendra.
      if (replyId !== null && (await call.response) === null) pending.delete(replyId);
    },
    // Ce que l'analyseur garde (envois, étapes, blocs) : pour vérifier ses bornes.
    size: () =>
      [...pending.values()].reduce(
        (total, send) => total + 1 + send.textSteps.size + send.blocks.size,
        0,
      ),
  } satisfies StreamParser & { size(): number };
}
