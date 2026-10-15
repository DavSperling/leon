import { z } from 'zod';
import type { Kind } from './client';

// Basecamp ne sait pas filtrer « modifié depuis » : on lit du plus récent au plus ancien et on
// s'arrête à la première date déjà vue. Un parcours (`Stream`) garde :
//   from : la date au-dessus de laquelle on lit (la fin du parcours précédent, ou `since`) ;
//   top  : la plus récente date vue pendant ce parcours (elle devient `from` à sa fin) ;
//   next : l'adresse de la page suivante, tant que le parcours n'est pas fini.
export type Stream = { from: string; top: string | null; next: string | null };
export type Cursor = Record<Kind, Stream>;

const date = z.string().refine((value) => !Number.isNaN(Date.parse(value)));
const stream = z.object({ from: date, top: date.nullable(), next: z.string().nullable() });
const cursorSchema = z.object({ message: stream, document: stream });

// Un curseur illisible repart de `since` : l'ingestion est idempotente, au pire on refait du travail.
// Une page suivante d'un autre compte (la connexion a été rebranchée sur un autre) est oubliée.
export function readCursor(raw: string | null, base: string, since: Date): Cursor {
  let value: unknown = null;
  try {
    value = raw === null ? null : JSON.parse(raw);
  } catch {
    value = null;
  }
  const parsed = cursorSchema.safeParse(value);
  if (!parsed.success) {
    const fresh = (): Stream => ({ from: since.toISOString(), top: null, next: null });
    return { message: fresh(), document: fresh() };
  }
  const own = (found: Stream): Stream =>
    found.next === null || found.next.startsWith(`${base}/`)
      ? found
      : { ...found, top: null, next: null };
  return { message: own(parsed.data.message), document: own(parsed.data.document) };
}

export function newest(dates: Array<string | null>): string | null {
  const known = dates.filter((value): value is string => value !== null);
  return known.reduce<string | null>(
    (best, value) => (best === null || Date.parse(value) > Date.parse(best) ? value : best),
    null,
  );
}
