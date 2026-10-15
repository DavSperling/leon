import { z } from 'zod';

// Le curseur : la date d'activité (secondes) de la dernière conversation rendue, et les identifiants
// déjà rendus à cette seconde. Missive date à la seconde : plusieurs conversations peuvent la partager.

const CursorSchema = z.object({ at: z.number(), seen: z.array(z.string()) });
export type Cursor = z.infer<typeof CursorSchema>;
type Dated = { id: string; last_activity_at: number };

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

// Déjà rendue : plus ancienne que le curseur, ou rendue à la seconde même du curseur.
export function isDone(mark: Cursor | null, row: Dated): boolean {
  if (mark === null) return false;
  const elapsed = row.last_activity_at - mark.at;
  return elapsed < 0 || (elapsed === 0 && mark.seen.includes(row.id));
}

// Les conversations arrivent de la plus ancienne à la plus récente, sans doublon, et jamais avant le
// curseur : à la même seconde, l'identifiant s'ajoute ; plus tard, le curseur repart de la nouvelle.
export function advance(mark: Cursor | null, row: Dated): Cursor {
  if (mark === null || row.last_activity_at > mark.at) {
    return { at: row.last_activity_at, seen: [row.id] };
  }
  return { at: mark.at, seen: [...mark.seen, row.id] };
}
