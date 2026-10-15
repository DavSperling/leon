import { z } from 'zod';
import type { Stream } from './client';

// Le curseur : par projet et par sorte d'élément, l'instant du dernier élément lu et les numéros
// déjà lus à cet instant. GitLab filtre « modifié à partir de » en incluant l'instant demandé : sans
// ces numéros, le dernier élément serait relu à chaque passage.

const CursorSchema = z.record(
  z.string(),
  z.object({ at: z.iso.datetime({ offset: true }), seen: z.array(z.number()) }),
);
export type Cursor = z.infer<typeof CursorSchema>;
type Mark = Cursor[string];
type Dated = { iid: number; updated_at: string };

export const cursorKey = (stream: Stream, project: string) => `${stream}:${project}`;

export function readCursor(text: string | null): Cursor {
  if (text === null) return {};
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

// Déjà lu : plus ancien que le curseur, ou lu à l'instant même du curseur.
export function isDone(mark: Mark | undefined, row: Dated): boolean {
  if (mark === undefined) return false;
  const elapsed = Date.parse(row.updated_at) - Date.parse(mark.at);
  return elapsed < 0 || (elapsed === 0 && mark.seen.includes(row.iid));
}

export function advance(mark: Mark | undefined, row: Dated): Mark {
  const elapsed = mark === undefined ? 1 : Date.parse(row.updated_at) - Date.parse(mark.at);
  if (mark === undefined || elapsed > 0) return { at: row.updated_at, seen: [row.iid] };
  if (elapsed < 0 || mark.seen.includes(row.iid)) return mark;
  return { at: mark.at, seen: [...mark.seen, row.iid] };
}

// GitLab veut AAAA-MM-JJTHH:MM:SSZ ; en tronquant les millisecondes on relit au plus la même
// seconde, et `isDone` écarte ce qui est déjà lu.
export const apiTime = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
