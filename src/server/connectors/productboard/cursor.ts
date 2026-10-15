import { z } from 'zod';

// Le curseur de la relève : l'instant (millisecondes) de la dernière note rendue et les identifiants
// déjà rendus à cet instant. Productboard filtre par date de modification (bornes comprises) mais ne
// trie pas par modification : on relit depuis cet instant et on écarte ce qui est déjà passé.

const MarkSchema = z.object({ at: z.number(), seen: z.array(z.string()) });

export type Mark = z.infer<typeof MarkSchema>;
export type Stamp = { at: number; id: string };

// Un curseur illisible repart de `since` : l'ingestion est idempotente, au pire on refait du travail.
export function readCursor(text: string | null): Mark | undefined {
  if (text === null) return undefined;
  try {
    const parsed = MarkSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

// Déjà passée : plus ancienne que le repère (ou, au premier passage, que `since`), ou lue à
// l'instant même du repère.
export function isDone(mark: Mark | undefined, since: Date, stamp: Stamp): boolean {
  if (mark === undefined) return stamp.at < since.getTime();
  return stamp.at < mark.at || (stamp.at === mark.at && mark.seen.includes(stamp.id));
}

export function advance(mark: Mark | undefined, stamp: Stamp): Mark {
  if (mark === undefined || stamp.at > mark.at) return { at: stamp.at, seen: [stamp.id] };
  if (stamp.at < mark.at || mark.seen.includes(stamp.id)) return mark;
  return { at: mark.at, seen: [...mark.seen, stamp.id] };
}
