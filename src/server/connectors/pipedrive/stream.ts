import { z } from 'zod';

// L'ordre de lecture de Pipedrive. Les deux listes (notes, activités) se filtrent par « modifié depuis »
// et se trient par date de modification, mais leurs pages se désignent par un rang (notes) ou un
// curseur (activités) : un rang bouge dès qu'une note est retouchée pendant la lecture, et ferait
// sauter une note. Chaque liste garde donc son repère (`Mark`) : l'instant de la dernière ligne
// lue et les lignes lues à cet instant exact ; après chaque page, la lecture repart de ce repère,
// jamais d'un rang. Le rang ou le curseur ne sert que si une page entière est déjà lue.

const MarkSchema = z.object({ at: z.iso.datetime({ offset: true }), seen: z.array(z.string()) });
const CursorSchema = z.object({ notes: MarkSchema.optional(), activities: MarkSchema.optional() });

export type Mark = z.infer<typeof MarkSchema>;
export type Cursor = z.infer<typeof CursorSchema>;
export type Position = string | number | undefined;
export type Row = { key: string; at: string };
export type Chunk<T> = { rows: T[]; mark: Mark };

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

// Déjà lue : plus ancienne que le repère, ou lue à l'instant même du repère.
function isDone(mark: Mark | undefined, row: Row): boolean {
  if (mark === undefined) return false;
  const elapsed = Date.parse(row.at) - Date.parse(mark.at);
  return elapsed < 0 || (elapsed === 0 && mark.seen.includes(row.key));
}

function advance(mark: Mark | undefined, row: Row): Mark {
  if (mark === undefined) return { at: row.at, seen: [row.key] };
  const elapsed = Date.parse(row.at) - Date.parse(mark.at);
  if (elapsed > 0) return { at: row.at, seen: [row.key] };
  if (elapsed < 0 || mark.seen.includes(row.key)) return mark;
  return { at: mark.at, seen: [...mark.seen, row.key] };
}

// Les lignes nouvelles de la liste, un groupe par page lue, avec le repère qui suit chaque groupe.
// `read` rend la page demandée et la position de la suivante (nulle à la fin).
export async function* freshRows<T extends Row>(
  read: (
    updatedSince: string,
    position: Position,
  ) => Promise<{ rows: T[]; next: string | number | null }>,
  from: string,
  start: Mark | undefined,
): AsyncGenerator<Chunk<T>> {
  let mark = start;
  let position: Position;
  for (;;) {
    const page = await read(mark?.at ?? from, position);
    const fresh = page.rows.filter((row) => !isDone(mark, row));
    let next = mark;
    for (const row of fresh) next = advance(next, row);
    if (next !== undefined && fresh.length > 0) {
      mark = next;
      yield { rows: fresh, mark: next };
    }
    if (page.next === null) return;
    position = fresh.length > 0 ? undefined : page.next;
  }
}
