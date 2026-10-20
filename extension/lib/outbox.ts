import { z } from 'zod';
import { type IngestPayload, IngestPayloadSchema } from '../../src/capture/turn';
import type { CaptureStatus, KeyValueStore } from './settings';

export const OUTBOX_KEY = 'leon.outbox';
export const OUTBOX_MAX = 500;
// storage.local est plafonné (10 Mo dans Chrome, 5 Mo avant la version 114) : au-delà, l'écriture échoue et la
// capture est perdue sans un mot. On reste en dessous ; les plus anciens sortent, comme au plafond en nombre.
export const OUTBOX_MAX_BYTES = 4 * 1024 * 1024;
// Échanges sortis du tampon sans avoir été envoyés, par raison : un total qui ne fait que croître, écrit par le
// seul service worker. La popup note ce qu'elle a déjà montré (DROPPED_SEEN_KEY) et dit la différence : aucune
// des deux ne réécrit ce que l'autre écrit, une perte comptée pendant que la popup lit n'est pas effacée.
export const DROPPED_KEY = 'leon.dropped';
export const DROPPED_SEEN_KEY = 'leon.dropped-seen';
// full : tampon plein ; refused : charge refusée pour toujours par le serveur (400, 413) ;
// token : en attente quand le jeton a changé.
export type DropReason = 'full' | 'refused' | 'token';
export type DroppedCounts = Partial<Record<DropReason, number>>;

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
  await addDropped(store, 'full', dropped);
}

const count = z.number().int().nonnegative().optional().catch(undefined);
const DroppedSchema = z
  .union([
    // Avant les raisons, un seul nombre : celui du tampon plein.
    z.number().transform((full) => ({ full })),
    z.object({ full: count, refused: count, token: count }),
  ])
  .catch({});

async function readCounts(store: KeyValueStore, key: string): Promise<DroppedCounts> {
  const counts = DroppedSchema.parse(await store.get(key));
  return Object.fromEntries(Object.entries(counts).filter(([, n]) => n !== undefined && n > 0));
}

async function addDropped(store: KeyValueStore, reason: DropReason, n: number): Promise<void> {
  if (n <= 0) return;
  const counts = await readCounts(store, DROPPED_KEY);
  await store.set(DROPPED_KEY, { ...counts, [reason]: (counts[reason] ?? 0) + n });
}

// Les échanges perdus depuis la dernière lecture, par raison (la popup les dit une fois).
export async function takeDropped(store: KeyValueStore): Promise<DroppedCounts> {
  const total = await readCounts(store, DROPPED_KEY);
  const seen = await readCounts(store, DROPPED_SEEN_KEY);
  const fresh = Object.fromEntries(
    Object.entries(total)
      .map(([reason, n = 0]) => [reason, n - (seen[reason as DropReason] ?? 0)] as const)
      .filter(([, n]) => n > 0),
  );
  if (Object.keys(fresh).length > 0) await store.set(DROPPED_SEEN_KEY, total);
  return fresh;
}

// Jeton auquel appartient le tampon (celui du dernier envoi).
export const OUTBOX_TOKEN_KEY = 'leon.outbox-token';
// Organisation d'un jeton, notée à chaque /me réussi.
export const OUTBOX_ORG_KEY = 'leon.outbox-org';
const OrganizationSchema = z
  .object({ token: z.string(), tenantId: z.string() })
  .nullable()
  .catch(null);

export async function noteOrganization(
  store: KeyValueStore,
  token: string,
  tenantId: string,
): Promise<void> {
  await store.set(OUTBOX_ORG_KEY, { token, tenantId });
}

// Le tampon appartient à l'organisation du jeton avec lequel il a été capté : quand le jeton change (autre jeton,
// ou jeton retiré), il est vidé et compté comme perte, pour ne pas partir vers une autre organisation, sauf si le
// nouveau jeton est de la même organisation (`organizationOf` la demande au serveur ; null si inconnue). Un tampon
// capté avant tout jeton (ou avant que le jeton ne soit noté) part avec le premier.
export async function forgetOutboxOnTokenChange(
  store: KeyValueStore,
  token: string | null,
  organizationOf: (token: string) => Promise<string | null>,
): Promise<void> {
  const previous = z
    .string()
    .nullable()
    .catch(null)
    .parse(await store.get(OUTBOX_TOKEN_KEY));
  if (previous === token) return;
  if (previous !== null) {
    const noted = OrganizationSchema.parse(await store.get(OUTBOX_ORG_KEY));
    const before = noted?.token === previous ? noted.tenantId : null;
    const after = before !== null && token !== null ? await organizationOf(token) : null;
    if (after !== null && after === before && token !== null) {
      await noteOrganization(store, token, after);
    } else {
      await addDropped(store, 'token', await countPending(store));
      await store.set(OUTBOX_KEY, []);
    }
  }
  await store.set(OUTBOX_TOKEN_KEY, token);
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
  let refused = 0;
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
      if (outcomeOf(status) === 'drop') refused += 1;
      connection = 'connected';
    }
  }
  await store.set(OUTBOX_KEY, kept);
  await addDropped(store, 'refused', refused);
  return connection;
}
