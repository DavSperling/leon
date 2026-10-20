import { z } from 'zod';

// Le curseur : par projet, l'instant du dernier élément lu (à la milliseconde) et les identifiants
// déjà lus à cet instant. Plane filtre « modifié à partir de » en incluant l'instant demandé : sans
// ces identifiants, le dernier élément serait relu à chaque passage.

const CursorSchema = z.record(
  z.string(),
  z.object({ at: z.iso.datetime({ offset: true }), seen: z.array(z.string()) }),
);
export type Cursor = z.infer<typeof CursorSchema>;
type Mark = Cursor[string];
type Dated = { id: string; updated_at: string };

// Un curseur illisible repart de `since` : l'ingestion est idempotente, au pire on refait du travail.
export function readCursor(text: string | null): Cursor {
  if (text === null) return {};
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

// Plane donne des microsecondes, `Date` des millisecondes (tronquées) : on compte en millisecondes.
// Un élément du même instant mais absent de `seen` est lu, au pire une fois de trop.
const millis = (instant: string): number => Date.parse(instant);

// Déjà lu : plus ancien que le curseur, ou lu à l'instant même du curseur.
export function isDone(mark: Mark | undefined, row: Dated): boolean {
  if (mark === undefined) return false;
  const elapsed = millis(row.updated_at) - millis(mark.at);
  return elapsed < 0 || (elapsed === 0 && mark.seen.includes(row.id));
}

export function advance(mark: Mark | undefined, row: Dated): Mark {
  const elapsed = mark === undefined ? 1 : millis(row.updated_at) - millis(mark.at);
  if (mark === undefined || elapsed > 0) {
    return { at: new Date(millis(row.updated_at)).toISOString(), seen: [row.id] };
  }
  if (elapsed < 0 || mark.seen.includes(row.id)) return mark;
  return { at: mark.at, seen: [...mark.seen, row.id] };
}
