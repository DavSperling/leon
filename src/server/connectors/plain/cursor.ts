import { z } from 'zod';

// Où en est le passage : `from` (les fils modifiés depuis cet instant), `started` (le début du
// passage, nul entre deux passages) et `after` (la position dans la liste de l'outil).
const RoundSchema = z.object({
  from: z.iso.datetime(),
  started: z.iso.datetime().nullable(),
  after: z.string().nullable(),
});
export type Round = z.infer<typeof RoundSchema>;

const CLOCK_MARGIN_MS = 5 * 60_000; // écart d'horloge entre l'outil et nous, délai de mise à jour

// Un curseur illisible repart de `since` : l'ingestion est idempotente, au pire on refait du travail.
export function readCursor(raw: string | null, since: Date): Round {
  let value: unknown = null;
  try {
    value = raw === null ? null : JSON.parse(raw);
  } catch {
    value = null;
  }
  const parsed = RoundSchema.safeParse(value);
  return parsed.success ? parsed.data : { from: since.toISOString(), started: null, after: null };
}

// Le passage suivant repart du début de celui-ci, moins une marge : un fil modifié pendant le
// passage, une fois la liste lue, est repris alors.
export function endRound(started: string): Round {
  const from = new Date(Date.parse(started) - CLOCK_MARGIN_MS).toISOString();
  return { from, started: null, after: null };
}

// L'outil écrit ses dates à la seconde (« 2024-10-28T18:30:00Z »), sans millisecondes.
export const toFilterDate = (iso: string) => iso.replace(/\.\d{3}Z$/, 'Z');
