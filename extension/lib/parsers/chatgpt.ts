import { z } from 'zod';
import { parseSseText } from '../sse';
import { parseJsonOrNull, type SiteParser } from './site-parser';

const CONVERSATION_PATHS = ['/backend-api/conversation', '/backend-api/f/conversation'];

// Seules les parties texte comptent : images et pièces jointes (metadata.attachments) ne sont jamais lues.
const RequestSchema = z.object({
  conversation_id: z.string().min(1).nullish(),
  messages: z
    .array(
      z.object({
        id: z.string().min(1),
        author: z.object({ role: z.string() }),
        content: z.object({ parts: z.array(z.unknown()).optional() }),
      }),
    )
    .optional(),
});

// Le message de réponse : assistant, texte, terminé, adressé à tous. Messages tool, system, thoughts, contexte caché
// (model_editable_context), appels d'outil (recipient autre que all) et messages non terminés écartés par ce schéma.
const AssistantMessageSchema = z.object({
  id: z.string().min(1),
  author: z.object({ role: z.literal('assistant') }),
  content: z.object({ content_type: z.literal('text'), parts: z.array(z.unknown()) }),
  status: z.literal('finished_successfully'),
  recipient: z.literal('all').optional(),
});

type Doc = Record<string, unknown>;
// Chaque document est un événement { message, conversation_id } ; les opérations s'appliquent au dernier.
// path et op : ceux de la dernière opération de premier niveau, que la forme courte reprend.
type StreamState = {
  docs: Doc[];
  path: string;
  op: string;
  complete: boolean;
  conversationId: string | null;
  title: string | null;
};

const isDoc = (value: unknown): value is Doc => typeof value === 'object' && value !== null;

function joinTextParts(parts: readonly unknown[]): string {
  return parts.filter((part): part is string => typeof part === 'string').join('\n');
}

function pushDoc(state: StreamState, doc: Doc): void {
  if (typeof doc.conversation_id === 'string') state.conversationId ??= doc.conversation_id;
  state.docs.push(doc);
}

// Pointeur JSON résolu sur les seules propriétés propres, jamais vers __proto__ : on est dans le monde MAIN,
// un flux ne doit pas pouvoir écrire dans Object.prototype de la page.
function resolvePointer(doc: Doc, path: string): { parent: Doc; key: string } | null {
  const keys = path
    .split('/')
    .slice(1)
    .map((key) => key.replaceAll('~1', '/').replaceAll('~0', '~'));
  const key = keys.pop();
  let node: unknown = doc;
  for (const step of keys) {
    if (!isDoc(node) || !Object.hasOwn(node, step)) return null;
    node = node[step];
  }
  if (!isDoc(node) || key === undefined || key === '__proto__') return null;
  return { parent: node, key };
}

function applyAtPath(doc: Doc, path: string, kind: string, value: unknown): void {
  const target = resolvePointer(doc, path);
  if (target === null) return;
  const { parent, key } = target;
  const current = parent[key];
  if (kind === 'add' || kind === 'replace') parent[key] = value;
  if (kind === 'append' && typeof current === 'string' && typeof value === 'string') {
    parent[key] = current + value;
  }
}

// add sur le chemin vide : un nouveau document (message) ; add et replace ailleurs : écrire la valeur ; append :
// concaténer. Le reste (remove, append d'un objet) est ignoré : sans effet sur le texte.
function applyOperation(state: StreamState, path: string, op: string, value: unknown): void {
  if (path === '') {
    if (op === 'add' && isDoc(value)) pushDoc(state, value);
    return;
  }
  const doc = state.docs.at(-1);
  if (doc) applyAtPath(doc, path, op, value);
}

// Format delta v1 : { p, o, v }. Une opération sans p (ou sans o) reprend le chemin (ou l'opération) de la
// précédente de même niveau : premier niveau du flux, ou même lot. Ainsi { v: { message } } après un add ajoute un
// message, et { v: [...] } après un patch est un lot. Les opérations d'un lot ne changent pas le premier niveau.
function applyEvent(state: StreamState, event: Doc): void {
  state.path = typeof event.p === 'string' ? event.p : state.path;
  state.op = typeof event.o === 'string' ? event.o : state.op;
  if (state.op !== 'patch') {
    applyOperation(state, state.path, state.op, event.v);
    return;
  }
  let path = '';
  let op = 'append';
  for (const inner of Array.isArray(event.v) ? event.v : []) {
    if (!isDoc(inner)) continue;
    path = typeof inner.p === 'string' ? inner.p : path;
    op = typeof inner.o === 'string' ? inner.o : op;
    applyOperation(state, path, op, inner.v);
  }
}

function replayStream(sseText: string): StreamState {
  const state: StreamState = {
    docs: [],
    path: '',
    op: 'append',
    complete: false,
    conversationId: null,
    title: null,
  };
  for (const { data } of parseSseText(sseText)) {
    // La marque de fin : sans elle, la réponse a pu être coupée sur un message intermédiaire.
    if (data === '[DONE]') state.complete = true;
    const event = parseJsonOrNull(data);
    if (!isDoc(event)) continue; // "v1" de delta_encoding, [DONE]
    if (event.type === 'message_stream_complete') state.complete = true;
    if (event.type === 'title_generation' && typeof event.title === 'string') {
      state.title = event.title;
    }
    if (isDoc(event.message)) {
      pushDoc(state, event); // ancien format : message complet à chaque événement
    } else if ('v' in event) {
      applyEvent(state, event);
    } else if (typeof event.conversation_id === 'string') {
      state.conversationId ??= event.conversation_id;
    }
  }
  return state;
}

// En partant de la fin, le dernier message de réponse au texte non vide ; les autres messages sont sautés.
function replyOf(docs: readonly Doc[]): { id: string; text: string } | null {
  for (let i = docs.length - 1; i >= 0; i--) {
    const parsed = AssistantMessageSchema.safeParse(docs[i]?.message);
    if (!parsed.success) continue;
    const text = joinTextParts(parsed.data.content.parts);
    if (text !== '') return { id: parsed.data.id, text };
  }
  return null;
}

export const chatgptParser: SiteParser = {
  site: 'chatgpt',
  matchesRequest: (url, method) => method === 'POST' && CONVERSATION_PATHS.includes(url.pathname),
  async parse({ requestBody, sseText, now }) {
    const request = RequestSchema.safeParse(parseJsonOrNull(requestBody));
    if (!request.success) return { rejected: 'format' };
    // Régénération (action « variant ») : pas de message utilisateur, rien à capter (C13).
    const user = request.data.messages?.findLast((message) => message.author.role === 'user');
    const userText = joinTextParts(user?.content.parts ?? []);
    if (!user || userText === '') return null;
    const stream = replayStream(sseText);
    if (!stream.complete) return { rejected: 'incomplet' };
    const assistant = replyOf(stream.docs);
    const conversationId = request.data.conversation_id ?? stream.conversationId;
    if (!assistant || !conversationId) return { rejected: 'format' };
    const ts = now.toISOString();
    return {
      site: 'chatgpt',
      conversationId,
      title: stream.title,
      user: { messageId: user.id, text: userText, ts },
      assistant: { messageId: assistant.id, text: assistant.text, ts },
    };
  },
};
