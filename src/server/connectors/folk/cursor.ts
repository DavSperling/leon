import { z } from 'zod';

// Le curseur : l'instant de création de la dernière note rendue (millisecondes) et les
// identifiants des notes déjà rendues à cet instant (deux notes peuvent le partager).
const CursorSchema = z.object({ at: z.number(), seen: z.array(z.string()) });
export type Mark = z.infer<typeof CursorSchema>;

// Un curseur illisible repart de `since` : l'ingestion est idempotente, au pire on refait du travail.
export function readCursor(text: string | null): Mark | null {
  if (text === null) return null;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Déjà rendue : créée avant le curseur, ou à l'instant même du curseur et déjà vue.
export function isDone(mark: Mark | null, at: number, id: string): boolean {
  if (mark === null) return false;
  return at < mark.at || (at === mark.at && mark.seen.includes(id));
}

// Les notes arrivent dans l'ordre croissant : une note n'est jamais plus ancienne que le curseur.
export function advance(mark: Mark | null, at: number, id: string): Mark {
  if (mark === null || at > mark.at) return { at, seen: [id] };
  return mark.seen.includes(id) ? mark : { at, seen: [...mark.seen, id] };
}
