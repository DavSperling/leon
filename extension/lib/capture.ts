import { z } from 'zod';
import {
  CapturedExchangeSchema,
  CaptureRejectionSchema,
  type RuntimeMessage,
  siteOfMessage,
} from './exchange';
import { enqueuePayload } from './outbox';
import { canCapture, type KeyValueStore, loadSettings, loadStatus, saveStatus } from './settings';
import { exchangeToPayload } from './to-payload';

const ExchangeMessageSchema = z.object({
  type: z.literal('leon/exchange'),
  exchange: CapturedExchangeSchema,
});

const RejectionMessageSchema = CaptureRejectionSchema.extend({
  type: z.literal('leon/rejection'),
});

// Rien ne quitte la page sans accord : consentement, pas de pause, site actif (C13). Un rejet passe la même porte.
// Service worker sans écouteur ou extension rechargée : l'échange est perdu, la page n'en sait rien.
export async function relayIfAllowed(
  store: KeyValueStore,
  message: RuntimeMessage,
  send: (message: RuntimeMessage) => Promise<unknown>,
): Promise<void> {
  try {
    if (canCapture(await loadSettings(store), siteOfMessage(message))) await send(message);
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

// Un rejet n'est jamais envoyé au serveur : il est noté pour la petite fenêtre (site, raison, heure), derrière la
// même porte qu'un échange. Renvoie vrai quand il a été noté.
export async function recordRejection(store: KeyValueStore, message: unknown): Promise<boolean> {
  const parsed = RejectionMessageSchema.safeParse(message);
  if (!parsed.success) return false;
  const { site, reason } = parsed.data;
  if (!canCapture(await loadSettings(store), site)) return false;
  const { lastRejection } = await loadStatus(store);
  await saveStatus(store, {
    lastRejection: { ...lastRejection, [site]: { reason, at: new Date().toISOString() } },
  });
  return true;
}
