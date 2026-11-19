import { z } from 'zod';
import { deriveMessageId } from '../message-id';
import { parseSseText } from '../sse';
import { parseJsonOrNull, type Rejection, type SiteParser } from './site-parser';

// POST /api/organizations/<org>/chat_conversations/<conv>/completion ; retry_completion (régénération) n'est pas capté.
const COMPLETION_PATH = /^\/api\/organizations\/[^/]+\/chat_conversations\/([^/]+)\/completion$/;

// Pièces jointes (attachments, files) jamais lues : seul le texte tapé compte.
const RequestSchema = z.object({
  prompt: z.string().min(1),
  parent_message_uuid: z.string().optional(),
  turn_message_uuids: z.object({ human_message_uuid: z.string().min(1) }).optional(),
});

const StreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message_start'),
    message: z.object({ uuid: z.string().min(1).optional(), id: z.string().min(1).optional() }),
  }),
  z.object({
    type: z.literal('content_block_start'),
    index: z.number(),
    content_block: z.object({ type: z.string() }),
  }),
  z.object({
    type: z.literal('content_block_delta'),
    index: z.number(),
    delta: z.object({ type: z.string(), text: z.string().optional() }),
  }),
  z.object({ type: z.literal('message_stop') }),
]);

type AssistantReply = { messageId: string; text: string };

// Texte des seuls blocs « text » (ni thinking ni tool_use) ; incomplet sans message_stop, format sans id ou sans texte.
function readAssistantReply(sseText: string): AssistantReply | Rejection {
  const textBlocks = new Set<number>();
  let messageId: string | null = null;
  let text = '';
  let stopped = false;
  for (const { data } of parseSseText(sseText)) {
    const parsed = StreamEventSchema.safeParse(parseJsonOrNull(data));
    if (!parsed.success) continue;
    const event = parsed.data;
    if (event.type === 'message_start') messageId = event.message.uuid ?? event.message.id ?? null;
    if (event.type === 'content_block_start' && event.content_block.type === 'text') {
      textBlocks.add(event.index);
    }
    if (event.type === 'content_block_delta' && textBlocks.has(event.index)) {
      if (event.delta.type === 'text_delta') text += event.delta.text ?? '';
    }
    if (event.type === 'message_stop') stopped = true;
  }
  if (!stopped) return { rejected: 'incomplet' };
  if (messageId === null || text === '') return { rejected: 'format' };
  return { messageId, text };
}

export const claudeAiParser: SiteParser = {
  site: 'claude_ai',
  matchesRequest: (url, method) => method === 'POST' && COMPLETION_PATH.test(url.pathname),
  async parse({ url, requestBody, sseText, now }) {
    const conversationId = COMPLETION_PATH.exec(url.pathname)?.[1];
    const request = RequestSchema.safeParse(parseJsonOrNull(requestBody));
    if (!conversationId || !request.success) return { rejected: 'format' };
    const reply = readAssistantReply(sseText);
    if ('rejected' in reply) return reply;
    const { prompt, parent_message_uuid: parent = '', turn_message_uuids } = request.data;
    const userId =
      turn_message_uuids?.human_message_uuid ??
      (await deriveMessageId('u', [conversationId, parent, prompt]));
    const ts = now.toISOString();
    return {
      site: 'claude_ai',
      conversationId,
      title: null,
      user: { messageId: userId, text: prompt, ts },
      assistant: { messageId: reply.messageId, text: reply.text, ts },
    };
  },
};
