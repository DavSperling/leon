import type { Turn } from '../capture/turn';

// La moitié de INGEST_BODY_MAX_BYTES : la marge couvre l'enveloppe du payload (source, titre).
export const BATCH_MAX_BYTES = 1024 * 1024;

// Découpe en lots d'au plus maxTurns tours et maxBytes octets de JSON, en gardant l'ordre.
// Un tour plus gros que maxBytes part seul : le serveur est seul juge de sa taille.
export function batchTurns(
  turns: Turn[],
  options: { maxTurns: number; maxBytes: number },
): Turn[][] {
  const batches: Turn[][] = [];
  let current: Turn[] = [];
  let currentBytes = 0;
  for (const turn of turns) {
    const bytes = Buffer.byteLength(JSON.stringify(turn)) + 1; // + la virgule
    const full = current.length >= options.maxTurns || currentBytes + bytes > options.maxBytes;
    if (current.length > 0 && full) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(turn);
    currentBytes += bytes;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
