import { z } from 'zod';

// Le curseur : l'instant de la dernière conversation lue et les identifiants déjà lus à cet instant.
// Crisp date ses conversations à la milliseconde, mais le filtre « modifié depuis » est relu un peu
// avant le curseur : sans ces identifiants, la dernière serait relue à chaque passage.

const MarkSchema = z.object({ at: z.iso.datetime({ offset: true }), seen: z.array(z.string()) });
export type Mark = z.infer<typeof MarkSchema>;
type Dated = { id: string; stamp: string };

export function readCursor(text: string | null): Mark | null {
  if (text === null) return null;
  try {
    const parsed = MarkSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Déjà lu : plus ancien que le curseur, ou lu à l'instant même du curseur.
export function isDone(mark: Mark, row: Dated): boolean {
  const elapsed = Date.parse(row.stamp) - Date.parse(mark.at);
  return elapsed < 0 || (elapsed === 0 && mark.seen.includes(row.id));
}

export function advance(mark: Mark, row: Dated): Mark {
  const elapsed = Date.parse(row.stamp) - Date.parse(mark.at);
  if (elapsed > 0) return { at: row.stamp, seen: [row.id] };
  if (elapsed < 0 || mark.seen.includes(row.id)) return mark;
  return { at: mark.at, seen: [...mark.seen, row.id] };
}
