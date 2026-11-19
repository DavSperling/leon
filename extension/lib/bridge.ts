import { z } from 'zod';
import {
  CAPTURE_MESSAGE_SOURCE,
  CapturedExchangeSchema,
  CaptureRejectionSchema,
  type RuntimeMessage,
  type Site,
  siteOfMessage,
} from './exchange';

// Un échange, ou un rejet (site et raison, rien d'autre : le schéma retire les clés en trop).
const CaptureMessageSchema = z.union([
  z.object({ source: z.literal(CAPTURE_MESSAGE_SOURCE), exchange: CapturedExchangeSchema }),
  z.object({ source: z.literal(CAPTURE_MESSAGE_SOURCE), rejection: CaptureRejectionSchema }),
]);

// Le site de l'échange doit être celui de la page : un script de chatgpt.com ne fait pas passer un échange claude_ai.
const SITE_BY_ORIGIN: Record<string, Site> = {
  'https://claude.ai': 'claude_ai',
  'https://chatgpt.com': 'chatgpt',
};

// Monde isolé : ne relaie au service worker qu'un message posté par la page elle-même, conforme au schéma.
export function forwardCaptureMessage(
  event: { source: unknown; origin: string; data: unknown },
  expected: { source: unknown; origin: string },
  send: (message: RuntimeMessage) => void,
): boolean {
  if (event.source !== expected.source || event.origin !== expected.origin) return false;
  const parsed = CaptureMessageSchema.safeParse(event.data);
  if (!parsed.success) return false;
  const message: RuntimeMessage =
    'exchange' in parsed.data
      ? { type: 'leon/exchange', exchange: parsed.data.exchange }
      : { type: 'leon/rejection', ...parsed.data.rejection };
  if (siteOfMessage(message) !== SITE_BY_ORIGIN[expected.origin]) return false;
  send(message);
  return true;
}
