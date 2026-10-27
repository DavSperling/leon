import { z } from 'zod';
import type { Board } from './client';

// Le curseur de Miro : la date de la dernière modification des tableaux déjà rendus, et ceux qui
// l'ont à cette date (plusieurs tableaux partagent la même seconde ; sans leurs identifiants, un
// passage coupé à 200 éléments ne progresserait plus).

export type Mark = { at: number; ids: Set<string> };

const CursorSchema = z.object({ at: z.iso.datetime(), ids: z.array(z.string()) });

// Un curseur illisible repart de since : l'ingestion est idempotente, au pire on refait du travail.
export function readMark(cursor: string | null, since: Date): Mark {
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(cursor ?? 'null'));
    if (parsed.success) return { at: Date.parse(parsed.data.at), ids: new Set(parsed.data.ids) };
  } catch {
    // Curseur illisible : on repart de since.
  }
  return { at: since.getTime(), ids: new Set() };
}

export const isAfter = (mark: Mark) => (board: Board) =>
  board.time > mark.at || (board.time === mark.at && !mark.ids.has(board.id));

export const byTime = (a: Board, b: Board): number => a.time - b.time || a.id.localeCompare(b.id);

// Le repère après avoir rendu `done`, des tableaux triés par `byTime`.
export function markAfter(done: Board[], previous: Mark): string {
  const last = done.at(-1);
  if (last === undefined) throw new Error('No board read');
  const ids = new Set(previous.at === last.time ? previous.ids : []);
  for (const board of done) if (board.time === last.time) ids.add(board.id);
  return JSON.stringify({ at: new Date(last.time).toISOString(), ids: [...ids] });
}
