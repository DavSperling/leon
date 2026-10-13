import { z } from 'zod';
import { CapturedExchangeSchema, type RuntimeMessage } from './exchange';
import { enqueuePayload } from './outbox';
import { canCapture, type KeyValueStore, loadSettings, loadStatus, saveStatus } from './settings';
import { exchangeToPayload } from './to-payload';

const ExchangeMessageSchema = z.object({
  type: z.literal('leon/exchange'),
  exchange: CapturedExchangeSchema,
});

// Rien ne quitte la page sans accord : consentement, pas de pause, site actif (C13).
// Service worker sans écouteur ou extension rechargée : l'échange est perdu, la page n'en sait rien.
export async function relayIfAllowed(
  store: KeyValueStore,
  message: RuntimeMessage,
  send: (message: RuntimeMessage) => Promise<unknown>,
): Promise<void> {
  try {
    if (canCapture(await loadSettings(store), message.exchange.site)) await send(message);
  } catch {}
}

// Seconde ligne de défense : le script isolé a déjà contrôlé, mais les réglages ont pu changer.
// Renvoie vrai quand un élément a été mis en tampon.
export async function recordExchange(store: KeyValueStore, message: unknown): Promise<boolean> {
  const parsed = ExchangeMessageSchema.safeParse(message);
  if (!parsed.success) return false;
  const { exchange } = parsed.data;
  if (!canCapture(await loadSettings(store), exchange.site)) return false;
  const payload = exchangeToPayload(exchange);
  if (payload === null) return false;
  await enqueuePayload(store, payload);
  const { lastCaptureAt } = await loadStatus(store);
  await saveStatus(store, {
    lastCaptureAt: { ...lastCaptureAt, [exchange.site]: new Date().toISOString() },
  });
  return true;
}
