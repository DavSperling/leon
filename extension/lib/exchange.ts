import { z } from 'zod';

// Échange capté sur un site (C13) : passe du monde MAIN au monde isolé, puis au service worker.
export const SITES = ['claude_ai', 'chatgpt'] as const;
export type Site = (typeof SITES)[number];

const CapturedMessageSchema = z.object({
  messageId: z.string().min(1).max(200),
  text: z.string().min(1).max(200_000),
  ts: z.iso.datetime(),
});

export const CapturedExchangeSchema = z.object({
  site: z.enum(SITES),
  conversationId: z.string().min(1).max(200),
  title: z.string().max(300).nullable(),
  user: CapturedMessageSchema,
  assistant: CapturedMessageSchema,
});
export type CapturedExchange = z.infer<typeof CapturedExchangeSchema>;

export const CAPTURE_MESSAGE_SOURCE = 'leon-capture';
// monde MAIN → monde isolé : window.postMessage({ source: CAPTURE_MESSAGE_SOURCE, exchange }, window.location.origin)
// monde isolé → service worker : browser.runtime.sendMessage({ type: 'leon/exchange', exchange })
export type RuntimeMessage = { type: 'leon/exchange'; exchange: CapturedExchange };
