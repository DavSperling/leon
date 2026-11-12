import { COULISSES_BODY_MAX_BYTES } from '../capture/api-contract';

// La moitié de INGEST_BODY_MAX_BYTES : la marge couvre l'enveloppe du payload (source, titre).
export const BATCH_MAX_BYTES = 1024 * 1024;
// Les blocs se comptent au JSON près : la marge ne couvre que l'enveloppe des coulisses (kind, external_id de 200
// caractères au plus, usages, accord_le), sous 1 Kio.
export const COULISSES_BATCH_MAX_BYTES = COULISSES_BODY_MAX_BYTES - 4 * 1024;

// Découpe en lots d'au plus maxTurns éléments (tours ou blocs des coulisses) et maxBytes octets de JSON, en gardant
// l'ordre. Un élément plus gros que maxBytes part seul : le serveur est seul juge de sa taille.
export function batchTurns<T>(turns: T[], options: { maxTurns: number; maxBytes: number }): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
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
