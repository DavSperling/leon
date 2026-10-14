import { z } from 'zod';
import {
  CAPTURE_MESSAGE_SOURCE,
  CapturedExchangeSchema,
  type RuntimeMessage,
  type Site,
} from './exchange';

const CaptureMessageSchema = z.object({
  source: z.literal(CAPTURE_MESSAGE_SOURCE),
  exchange: CapturedExchangeSchema,
});

// Le site de l'échange doit être celui de la page : un script de chatgpt.com ne fait pas passer un échange claude_ai.
const SITE_BY_ORIGIN: Record<string, Site> = {
  'https://claude.ai': 'claude_ai',
  'https://chatgpt.com': 'chatgpt',
};

// Monde isolé : ne relaie au service worker qu'un échange posté par la page elle-même, conforme au schéma.
export function forwardCaptureMessage(
  event: { source: unknown; origin: string; data: unknown },
  expected: { source: unknown; origin: string },
  send: (message: RuntimeMessage) => void,
): boolean {
  if (event.source !== expected.source || event.origin !== expected.origin) return false;
  const parsed = CaptureMessageSchema.safeParse(event.data);
  if (!parsed.success || parsed.data.exchange.site !== SITE_BY_ORIGIN[expected.origin])
    return false;
  send({ type: 'leon/exchange', exchange: parsed.data.exchange });
  return true;
}
