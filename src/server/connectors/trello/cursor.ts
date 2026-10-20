import { z } from 'zod';
import type { CardRef } from './client';

// Le curseur de la relève : où l'on en est dans chaque tableau, et l'ordre dans lequel on rend les cartes.

// Par tableau : la dernière carte rendue et la date de sa dernière action.
const CursorSchema = z.record(z.string(), z.object({ at: z.iso.datetime(), id: z.string() }));
export type Cursor = z.infer<typeof CursorSchema>;
export type Mark = Cursor[string];
export type Touched = { id: string; at: string; ms: number };

export function readCursor(text: string | null): Cursor {
  if (text === null) return {};
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// Trello veut AAAA-MM-JJTHH:MM:SSZ, sans millisecondes.
export const apiTime = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

// Une carte par entrée, à l'heure de sa dernière action, de la plus ancienne à la plus récente.
export function touchedCards(refs: CardRef[]): Touched[] {
  const latest = new Map<string, Touched>();
  for (const { cardId, date } of refs) {
    const ms = Date.parse(date);
    if (Number.isFinite(ms) && ms > (latest.get(cardId)?.ms ?? Number.NEGATIVE_INFINITY)) {
      latest.set(cardId, { id: cardId, at: new Date(ms).toISOString(), ms });
    }
  }
  return [...latest.values()].sort((a, b) => a.ms - b.ms || compareIds(a.id, b.id));
}

export function isDone(mark: Mark | undefined, card: Touched): boolean {
  if (mark === undefined) return false;
  const elapsed = card.ms - Date.parse(mark.at);
  return elapsed < 0 || (elapsed === 0 && card.id <= mark.id);
}
