import { z } from 'zod';

// Le curseur garde une position par flux : la boîte de réception, les éléments envoyés, l'agenda.
// Une position est l'instant du dernier élément lu et les identifiants déjà lus à cet instant :
// Graph date le courrier à la seconde, et « ge » (plus récent ou égal) rend l'élément du curseur.

export const MarkSchema = z.object({ at: z.iso.datetime(), seen: z.array(z.string()) });
const CursorSchema = z.object({
  inbox: MarkSchema.nullable(),
  sent: MarkSchema.nullable(),
  events: MarkSchema.nullable(),
});

export type Mark = z.infer<typeof MarkSchema>;
export type Cursor = z.infer<typeof CursorSchema>;
export type StreamKey = keyof Cursor;
type Dated = { id: string; at: string };

// Un curseur illisible repart de `since` : l'ingestion est idempotente, au pire on refait du travail.
export function readCursor(text: string | null): Cursor {
  const fresh: Cursor = { inbox: null, sent: null, events: null };
  if (text === null) return fresh;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : fresh;
  } catch {
    return fresh;
  }
}

// Déjà lu : plus ancien que la position, ou lu à l'instant même de la position.
export function isDone(mark: Mark | null, row: Dated): boolean {
  if (mark === null) return false;
  const elapsed = Date.parse(row.at) - Date.parse(mark.at);
  return elapsed < 0 || (elapsed === 0 && mark.seen.includes(row.id));
}

// La même position (même objet) quand la ligne n'apporte rien.
export function advance(mark: Mark | null, row: Dated): Mark {
  const at = new Date(row.at).toISOString();
  const elapsed = mark === null ? 1 : Date.parse(at) - Date.parse(mark.at);
  if (mark === null || elapsed > 0) return { at, seen: [row.id] };
  if (elapsed < 0 || mark.seen.includes(row.id)) return mark;
  return { at: mark.at, seen: [...mark.seen, row.id] };
}
