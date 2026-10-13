import { z } from 'zod';
import { parseSseText } from '../sse';
import { parseJsonOrNull, type SiteParser } from './site-parser';

const CONVERSATION_PATHS = ['/backend-api/conversation', '/backend-api/f/conversation'];

// Seules les parties texte comptent : images et pièces jointes (metadata.attachments) ne sont jamais lues.
const RequestSchema = z.object({
  conversation_id: z.string().min(1).optional(),
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

// Messages tool, system et thoughts (content_type « thoughts ») écartés par ce schéma.
const AssistantMessageSchema = z.object({
  id: z.string().min(1),
  author: z.object({ role: z.literal('assistant') }),
  content: z.object({ content_type: z.literal('text'), parts: z.array(z.unknown()) }),
  status: z.string(),
});

type Doc = Record<string, unknown>;
// Chaque document est un événement { message, conversation_id } ; les opérations s'appliquent au dernier.
type StreamState = {
  docs: Doc[];
  lastPath: string;
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

// Format delta v1 : { p, o, v } ; « patch » porte un lot ; la forme compacte { v } ajoute au dernier chemin.
function applyOperation(state: StreamState, op: Doc): void {
  const path = typeof op.p === 'string' ? op.p : state.lastPath;
  const kind = typeof op.o === 'string' ? op.o : 'append';
  if (kind === 'patch') {
    const batch: unknown[] = Array.isArray(op.v) ? op.v : [];
    for (const inner of batch) {
      if (isDoc(inner)) applyOperation(state, inner);
    }
    return;
  }
  if (path === '') {
    if (kind === 'add' && isDoc(op.v)) pushDoc(state, op.v);
    return;
  }
  state.lastPath = path;
  const doc = state.docs.at(-1);
  if (doc) applyAtPath(doc, path, kind, op.v);
}

function replayStream(sseText: string): StreamState {
  const state: StreamState = { docs: [], lastPath: '', conversationId: null, title: null };
  for (const { data } of parseSseText(sseText)) {
    const event = parseJsonOrNull(data);
    if (!isDoc(event)) continue; // "v1" de delta_encoding, [DONE]
    if (event.type === 'title_generation' && typeof event.title === 'string') {
      state.title = event.title;
    }
    if (isDoc(event.message)) {
      pushDoc(state, event); // ancien format : message complet à chaque événement
    } else if ('v' in event) {
      applyOperation(state, event);
    } else if (typeof event.conversation_id === 'string') {
      state.conversationId ??= event.conversation_id;
    }
  }
  return state;
}

function finishedAssistantText(docs: readonly Doc[]): { id: string; text: string } | null {
  for (let i = docs.length - 1; i >= 0; i--) {
    const parsed = AssistantMessageSchema.safeParse(docs[i]?.message);
    if (!parsed.success) continue;
    const text = joinTextParts(parsed.data.content.parts);
    if (parsed.data.status !== 'finished_successfully' || text === '') return null;
    return { id: parsed.data.id, text };
  }
  return null;
}

export const chatgptParser: SiteParser = {
  site: 'chatgpt',
  matchesRequest: (url, method) => method === 'POST' && CONVERSATION_PATHS.includes(url.pathname),
  async parse({ requestBody, sseText, now }) {
    const request = RequestSchema.safeParse(parseJsonOrNull(requestBody));
    if (!request.success) return null;
    // Régénération (action « variant ») : pas de message utilisateur, rien à capter (C13).
    const user = request.data.messages?.findLast((message) => message.author.role === 'user');
    const userText = joinTextParts(user?.content.parts ?? []);
    const stream = replayStream(sseText);
    const assistant = finishedAssistantText(stream.docs);
    const conversationId = request.data.conversation_id ?? stream.conversationId;
    if (!user || userText === '' || !assistant || !conversationId) return null;
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
