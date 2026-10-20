import { z } from 'zod';
import type { ConnectorHttp, HttpRequest } from '../http';

// La pagination de l'API v2 de Plane : deux enveloppes sans clé en commun, par décalage (`next`,
// un entier) et par curseur (`next_cursor` et `has_more`).
type Envelope<T> = {
  data: T[];
  next?: number | null;
  next_cursor?: string | null;
  has_more?: boolean | null;
};
const envelope = <T>(row: z.ZodType<T>): z.ZodType<Envelope<T>> =>
  z.object({
    data: z.array(row),
    next: z.number().nullish(),
    next_cursor: z.string().nullish(),
    has_more: z.boolean().nullish(),
  });

// Une page à la fois, jusqu'à la dernière ou jusqu'à `pagesMax`. Les autres paramètres sont
// repris tels quels à chaque requête (le curseur de Plane ne code que la position). On s'arrête
// si l'outil ne fait pas avancer le curseur ou le décalage, au lieu de boucler.
export async function* pages<T>(
  http: ConnectorHttp,
  first: HttpRequest,
  row: z.ZodType<T>,
  pagesMax = Number.POSITIVE_INFINITY,
): AsyncGenerator<T[]> {
  let request = first;
  let offset = 0;
  for (let count = 0; count < pagesMax; count++) {
    const page = await http.json(request, envelope(row));
    if (page.data.length === 0) return;
    yield page.data;
    const token = page.next_cursor;
    if (token && page.has_more !== false && token !== request.query?.cursor) {
      request = { ...request, query: { ...request.query, cursor: token } };
    } else if (typeof page.next === 'number' && page.next > offset) {
      offset = page.next;
      request = { ...request, query: { ...request.query, offset } };
    } else {
      return;
    }
  }
}

export async function all<T>(source: AsyncIterable<T[]>): Promise<T[]> {
  const rows: T[] = [];
  for await (const page of source) rows.push(...page);
  return rows;
}
