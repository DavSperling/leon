import { z } from 'zod';
import { type IngestPayload, IngestPayloadSchema } from '../../src/capture/turn';
import type { CaptureStatus, KeyValueStore } from './settings';

export const OUTBOX_KEY = 'leon.outbox';
export const OUTBOX_MAX = 500;

const OutboxItemSchema = z.object({
  id: z.string(),
  payload: IngestPayloadSchema,
  createdAt: z.string(),
});
export type OutboxItem = z.infer<typeof OutboxItemSchema>;

async function loadOutbox(store: KeyValueStore): Promise<OutboxItem[]> {
  return z.array(OutboxItemSchema).parse((await store.get(OUTBOX_KEY)) ?? []);
}

export async function countPending(store: KeyValueStore): Promise<number> {
  return (await loadOutbox(store)).length;
}

export async function enqueuePayload(store: KeyValueStore, payload: IngestPayload): Promise<void> {
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    payload,
    createdAt: new Date().toISOString(),
  };
  const items = [...(await loadOutbox(store)), item];
  await store.set(OUTBOX_KEY, items.slice(-OUTBOX_MAX));
}

// 'stop' : on garde l'élément et on arrête ; 'drop' : charge définitivement refusée (400, 413), on passe à la suivante.
function outcomeOf(status: number | null): 'sent' | 'drop' | 'stop' {
  if (status !== null && status >= 200 && status < 300) return 'sent';
  if (status === 400 || status === 413) return 'drop';
  return 'stop';
}

// Envoie dans l'ordre d'arrivée les éléments que `shouldSend` autorise (pause, site coupé) ; les autres restent en tampon.
// Sur tout autre échec, les éléments restent et l'alarme réessaie.
// L'appelant ne lance qu'un envoi à la fois (le service worker les met en file).
export async function flushOutbox(
  store: KeyValueStore,
  post: (payload: IngestPayload) => Promise<Response>,
  shouldSend: (payload: IngestPayload) => boolean,
): Promise<CaptureStatus['connection']> {
  const items = await loadOutbox(store);
  let connection: CaptureStatus['connection'] = 'unknown';
  const kept: OutboxItem[] = [];
  let stopped = false;
  for (const item of items) {
    if (stopped || !shouldSend(item.payload)) {
      kept.push(item);
      continue;
    }
    const status = await post(item.payload).then(
      (response) => response.status,
      () => null,
    );
    if (outcomeOf(status) === 'stop') {
      connection = status === 401 ? 'unauthorized' : 'unreachable';
      stopped = true;
      kept.push(item);
    } else {
      connection = 'connected';
    }
  }
  await store.set(OUTBOX_KEY, kept);
  return connection;
}
