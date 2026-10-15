import { z } from 'zod';

// Le curseur : l'instant de la dernière occurrence du dernier problème rendu, et les identifiants
// déjà rendus à cet instant. Sentry filtre « vu depuis » à la minute près : chaque passage relit
// quelques minutes de trop, et ces deux informations écartent ce qui est déjà lu.

const CursorSchema = z.object({ at: z.iso.datetime({ offset: true }), seen: z.array(z.string()) });
export type Cursor = z.infer<typeof CursorSchema>;
type Dated = { id: string; lastSeen: string };

// Un curseur illisible repart de `since` : l'ingestion est idempotente, au pire on refait du travail.
export function readCursor(text: string | null): Cursor | null {
  if (text === null) return null;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Déjà rendu : plus ancien que le curseur, ou rendu à l'instant même du curseur.
export function isDone(mark: Cursor | null, row: Dated): boolean {
  if (mark === null) return false;
  const elapsed = Date.parse(row.lastSeen) - Date.parse(mark.at);
  return elapsed < 0 || (elapsed === 0 && mark.seen.includes(row.id));
}

// Les problèmes sont rendus du plus ancien au plus récent : le curseur ne fait qu'avancer.
export function advance(mark: Cursor | null, row: Dated): Cursor {
  const elapsed = mark === null ? 1 : Date.parse(row.lastSeen) - Date.parse(mark.at);
  if (mark === null || elapsed > 0) return { at: row.lastSeen, seen: [row.id] };
  if (elapsed < 0 || mark.seen.includes(row.id)) return mark;
  return { at: mark.at, seen: [...mark.seen, row.id] };
}
