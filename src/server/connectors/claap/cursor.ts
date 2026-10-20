import { z } from 'zod';

// Claap ne filtre que sur la création (createdAfter), jamais sur la modification, et un
// enregistrement n'a de transcription que quelque temps après sa création. Le curseur garde donc :
//   after : la création du dernier enregistrement dépassé ;
//   seen  : les enregistrements déjà lus (identifiant → création), pour ne pas relire leur
//           transcription quand la liste repart six heures avant `after`.
// Un enregistrement dont la transcription arrive dans les six heures est ainsi encore vu.
const WINDOW_MS = 6 * 3_600_000;

const CursorSchema = z.object({
  after: z.iso.datetime(),
  seen: z.record(z.string(), z.iso.datetime()),
});
export type Cursor = z.infer<typeof CursorSchema>;

// Un curseur illisible fait repartir de `since` : relire ne crée aucun doublon.
export function readCursor(raw: string | null): Cursor | null {
  if (raw === null) return null;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Où repart la liste : six heures avant le dernier enregistrement dépassé, jamais avant `since`.
export function listStart(cursor: Cursor | null, since: Date): Date {
  if (cursor === null) return since;
  return new Date(Math.max(since.getTime(), Date.parse(cursor.after) - WINDOW_MS));
}

// `seen` est rogné aux enregistrements que la prochaine liste montrerait encore.
export function writeCursor(after: string, seen: Map<string, string>): string {
  const limit = new Date(Date.parse(after) - WINDOW_MS).toISOString();
  const kept = [...seen].filter(([, created]) => created >= limit);
  return JSON.stringify({ after, seen: Object.fromEntries(kept) });
}
