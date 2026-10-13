import { z } from 'zod';
import { deriveMessageId } from '../message-id';
import { parseSseText } from '../sse';
import { parseJsonOrNull, type SiteParser } from './site-parser';

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

// Texte des seuls blocs « text » (ni thinking ni tool_use) ; null si le flux ne s'est pas terminé.
function readAssistantReply(sseText: string): AssistantReply | null {
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
  if (!stopped || messageId === null || text === '') return null;
  return { messageId, text };
}

export const claudeAiParser: SiteParser = {
  site: 'claude_ai',
  matchesRequest: (url, method) => method === 'POST' && COMPLETION_PATH.test(url.pathname),
  async parse({ url, requestBody, sseText, now }) {
    const conversationId = COMPLETION_PATH.exec(url.pathname)?.[1];
    const request = RequestSchema.safeParse(parseJsonOrNull(requestBody));
    const reply = readAssistantReply(sseText);
    if (!conversationId || !request.success || reply === null) return null;
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
