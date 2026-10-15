import { z } from 'zod';

// Le curseur : l'instant (en millisecondes) du dernier événement lu, et les événements lus dans les
// deux secondes qui précèdent cet instant. Front filtre les événements sur leur date d'émission mais
// les trie sur leur date de création : on relit un peu avant le curseur pour ne pas en perdre un
// qui arrive en retard, et ces identifiants évitent de relire (et de recompter) les conversations
// déjà lues. Sans eux, la dernière conversation serait relue à chaque passage.

export const OVERLAP_MS = 2000;

const MarkSchema = z.object({
  at: z.number(),
  seen: z.array(z.tuple([z.string(), z.number()])),
});
export type Mark = z.infer<typeof MarkSchema>;
export type Read = { id: string; ms: number };

export function readCursor(text: string | null): Mark | null {
  if (text === null) return null;
  try {
    const parsed = MarkSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const isSeen = (mark: Mark, id: string): boolean => mark.seen.some(([seen]) => seen === id);

export function advance(mark: Mark, events: Read[]): Mark {
  const at = Math.max(mark.at, ...events.map((event) => event.ms));
  const seen = [...mark.seen, ...events.map((event): [string, number] => [event.id, event.ms])];
  return { at, seen: seen.filter(([, ms]) => ms > at - OVERLAP_MS) };
}

// Front veut des secondes, avec trois décimales au plus.
export const afterOf = (mark: Mark): string => ((mark.at - OVERLAP_MS) / 1000).toFixed(3);
