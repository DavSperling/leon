import { z } from 'zod';
import type { Conversation } from './client';

// Le curseur : l'instant (secondes) de la dernière conversation rendue et les numéros déjà rendus
// à cet instant. Intercom date ses conversations à la seconde : plusieurs peuvent la partager, et
// la recherche relit un peu avant le curseur. Sans ces numéros, la dernière serait relue à chaque
// passage.

const MarkSchema = z.object({ at: z.number(), seen: z.array(z.string()) });
export type Mark = z.infer<typeof MarkSchema>;
type Dated = Pick<Conversation, 'id' | 'updated_at'>;

// Un curseur illisible repart de `since` : l'ingestion est idempotente, au pire on refait du travail.
export function readCursor(text: string | null): Mark | null {
  if (text === null) return null;
  try {
    const parsed = MarkSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Déjà rendue : plus ancienne que le curseur, ou rendue à l'instant même du curseur.
export function isDone(mark: Mark, row: Dated): boolean {
  return row.updated_at < mark.at || (row.updated_at === mark.at && mark.seen.includes(row.id));
}

export function advance(mark: Mark, row: Dated): Mark {
  if (row.updated_at > mark.at) return { at: row.updated_at, seen: [row.id] };
  if (row.updated_at < mark.at || mark.seen.includes(row.id)) return mark;
  return { at: mark.at, seen: [...mark.seen, row.id] };
}
