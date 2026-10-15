import { z } from 'zod';

// Le curseur : la date « modifiée depuis » du passage en cours et la prochaine page à lire. Help
// Scout pagine par numéro de page sur une liste triée par date de modification, sans exposer cette
// date : on ne peut pas reprendre « après le dernier élément », seulement à la page suivante.

const CursorSchema = z.object({
  since: z.iso.datetime({ offset: true }),
  page: z.number().int().min(1),
});
export type Cursor = z.infer<typeof CursorSchema>;

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

// Help Scout lit une date ISO 8601 sans millisecondes (« 2018-05-04T12:00:03Z »).
export function apiDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
