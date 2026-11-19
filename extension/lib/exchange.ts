import { z } from 'zod';

// Échange capté sur un site (C13) : passe du monde MAIN au monde isolé, puis au service worker.
export const SITES = ['claude_ai', 'chatgpt'] as const;
export type Site = (typeof SITES)[number];

// Un très long message est coupé à la borne plutôt que de faire rejeter tout l'échange
// (le texte est de toute façon tronqué à TURN_TEXT_MAX avant l'envoi).
const CapturedMessageSchema = z.object({
  messageId: z.string().min(1).max(200),
  text: z
    .string()
    .min(1)
    .transform((text) => text.slice(0, 200_000)),
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

// Un échange non capté, sans aucun contenu : le site et la raison seulement. Il ne quitte jamais le navigateur, la
// petite fenêtre le montre. format : la requête ou la réponse n'a pas la forme attendue (le site a peut-être
// changé) ; incomplet : la réponse n'est pas allée au bout (coupée, arrêtée, trop grosse).
export const REJECT_REASONS = ['format', 'incomplet'] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];
// z.object retire les clés en trop : rien d'autre que le site et la raison ne passe.
export const CaptureRejectionSchema = z.object({
  site: z.enum(SITES),
  reason: z.enum(REJECT_REASONS),
});
export type CaptureRejection = z.infer<typeof CaptureRejectionSchema>;

export const CAPTURE_MESSAGE_SOURCE = 'leon-capture';
// monde MAIN → monde isolé : window.postMessage({ source: CAPTURE_MESSAGE_SOURCE, exchange }, window.location.origin)
// (ou { source, rejection } pour un rejet)
// monde isolé → service worker : browser.runtime.sendMessage({ type: 'leon/exchange', exchange })
// (ou { type: 'leon/rejection', site, reason })
export type CaptureMessage = { exchange: CapturedExchange } | { rejection: CaptureRejection };
export type RuntimeMessage =
  | { type: 'leon/exchange'; exchange: CapturedExchange }
  | ({ type: 'leon/rejection' } & CaptureRejection);

export const siteOfMessage = (message: RuntimeMessage): Site =>
  message.type === 'leon/exchange' ? message.exchange.site : message.site;
