import { z } from 'zod';

// Le curseur de la relève. Airtable ne rend pas la date de modification d'un enregistrement et ne
// trie pas dessus : on lit par fenêtres de temps successives (modifié après `from`, au plus tard à
// `to`), de la plus ancienne à la plus récente. Par table (« base/table ») :
//   - entre deux fenêtres : `from` est la fin de la dernière fenêtre lue, `to` et `after` sont nuls ;
//   - au milieu d'une fenêtre : `from` et `to` en sont les bornes, `after` est le dernier
//     enregistrement rendu (ils sont rendus dans l'ordre de leur identifiant).

export const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// Un passage repart une minute avant la fin du précédent : l'heure d'Airtable et la nôtre peuvent
// différer de quelques secondes. L'ingestion ignore ce qui est déjà connu.
export const OVERLAP_MS = 60 * 1000;

const MarkSchema = z.object({
  from: z.number(),
  to: z.number().nullable(),
  after: z.string().nullable(),
});
const CursorSchema = z.record(z.string(), MarkSchema);

export type Mark = z.infer<typeof MarkSchema>;
export type Cursor = z.infer<typeof CursorSchema>;

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

// Où reprendre : exactement là au milieu d'une fenêtre, sinon une minute avant la fin de la dernière.
export function resumePoint(mark: Mark | undefined, since: Date): Mark {
  if (mark === undefined) return { from: since.getTime(), to: null, after: null };
  if (mark.to !== null) return mark;
  return { from: mark.from - OVERLAP_MS, to: null, after: null };
}

export const betweenWindows = (at: number): Mark => ({ from: at, to: null, after: null });
