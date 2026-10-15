import { z } from 'zod';

// Le curseur de la relève. Attio ne filtre ni ne trie par date : chaque passage relit la liste
// entière et écarte ce qui est déjà passé. Le repère, par sorte d'élément (notes, fils), est
// l'instant (millisecondes) du dernier élément rendu et les identifiants déjà rendus à cet instant.

const MarkSchema = z.object({ at: z.number(), seen: z.array(z.string()) });
const CursorSchema = z.object({ notes: MarkSchema.optional(), threads: MarkSchema.optional() });

export type Cursor = z.infer<typeof CursorSchema>;
export type Mark = z.infer<typeof MarkSchema>;
export type Stamp = { at: number; id: string };

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

// Déjà passé : plus ancien que le repère (ou, au premier passage, que `since`), ou lu à l'instant
// même du repère.
export function isDone(mark: Mark | undefined, since: Date, stamp: Stamp): boolean {
  if (mark === undefined) return stamp.at < since.getTime();
  return stamp.at < mark.at || (stamp.at === mark.at && mark.seen.includes(stamp.id));
}

export function advance(mark: Mark | undefined, stamp: Stamp): Mark {
  if (mark === undefined || stamp.at > mark.at) return { at: stamp.at, seen: [stamp.id] };
  if (stamp.at < mark.at || mark.seen.includes(stamp.id)) return mark;
  return { at: mark.at, seen: [...mark.seen, stamp.id] };
}
