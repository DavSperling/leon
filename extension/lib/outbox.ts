import { z } from 'zod';
import { type IngestPayload, IngestPayloadSchema } from '../../src/capture/turn';
import type { CaptureStatus, KeyValueStore } from './settings';

export const OUTBOX_KEY = 'leon.outbox';
export const OUTBOX_MAX = 500;
// storage.local est plafonné (10 Mo dans Chrome, 5 Mo avant la version 114) : au-delà, l'écriture échoue et la
// capture est perdue sans un mot. On reste en dessous ; les plus anciens sortent, comme au plafond en nombre.
export const OUTBOX_MAX_BYTES = 4 * 1024 * 1024;
// Échanges sortis du tampon sans avoir été envoyés, en attendant que la popup le dise.
export const DROPPED_KEY = 'leon.dropped';

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

const byteSize = (item: OutboxItem) => new TextEncoder().encode(JSON.stringify(item)).length;

export async function enqueuePayload(store: KeyValueStore, payload: IngestPayload): Promise<void> {
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    payload,
    createdAt: new Date().toISOString(),
  };
  const all = [...(await loadOutbox(store)), item];
  // Un échange plus gros que tout le tampon n'y entre pas, sans pousser les autres dehors.
  const kept =
    byteSize(item) > OUTBOX_MAX_BYTES ? all.slice(-OUTBOX_MAX - 1, -1) : all.slice(-OUTBOX_MAX);
  const sizes = kept.map(byteSize);
  let bytes = sizes.reduce((sum, size) => sum + size, 0);
  let first = 0;
  while (bytes > OUTBOX_MAX_BYTES) bytes -= sizes[first++] ?? 0;
  await store.set(OUTBOX_KEY, kept.slice(first));
  const dropped = all.length - (kept.length - first);
  if (dropped > 0) await store.set(DROPPED_KEY, (await readDropped(store)) + dropped);
}

async function readDropped(store: KeyValueStore): Promise<number> {
  return z
    .number()
    .int()
    .nonnegative()
    .catch(0)
    .parse(await store.get(DROPPED_KEY));
}

// Le nombre d'échanges perdus depuis la dernière lecture, remis à zéro (la popup le dit une fois).
export async function takeDropped(store: KeyValueStore): Promise<number> {
  const dropped = await readDropped(store);
  if (dropped > 0) await store.set(DROPPED_KEY, 0);
  return dropped;
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
