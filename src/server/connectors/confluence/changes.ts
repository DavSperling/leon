import { z } from 'zod';
import { type Api, listPageStubs, type PageStub } from './client';

// Quelles pages ont changé depuis la dernière fois. L'API trie par date de modification mais n'a pas
// de filtre « modifié depuis » : on lit la liste de la plus récente à la plus ancienne, on s'arrête à la
// première page antérieure au repère, puis on rend les pages trouvées de la plus ancienne à la plus
// récente. Le curseur est un repère JSON : la date de la dernière page rendue, et les pages déjà
// rendues à cette date (sans leurs identifiants, plus de 200 pages à la même milliseconde ne
// progresseraient plus).

export type Mark = { at: number; ids: Set<string> };
const CursorSchema = z.object({ at: z.iso.datetime(), ids: z.array(z.string()) });

export function readMark(cursor: string | null, since: Date): Mark {
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(cursor ?? 'null'));
    if (parsed.success) return { at: Date.parse(parsed.data.at), ids: new Set(parsed.data.ids) };
  } catch {
    // Curseur illisible : on repart de since.
  }
  return { at: since.getTime(), ids: new Set() };
}

const modifiedAt = (stub: PageStub) => Date.parse(stub.version.createdAt);

function oldestFirst(found: Map<string, PageStub>): PageStub[] {
  return [...found.values()].sort(
    (a, b) => modifiedAt(a) - modifiedAt(b) || a.id.localeCompare(b.id),
  );
}

export async function pagesSince(api: Api, mark: Mark): Promise<PageStub[]> {
  const found = new Map<string, PageStub>();
  for await (const answer of listPageStubs(api)) {
    for (const stub of answer.results) {
      if (modifiedAt(stub) < mark.at) return oldestFirst(found);
      if (modifiedAt(stub) > mark.at || !mark.ids.has(stub.id)) found.set(stub.id, stub);
    }
  }
  return oldestFirst(found);
}

// Le repère après avoir lu `done`, qui commence à la plus ancienne page trouvée.
export function markAfter(done: PageStub[], previous: Mark): string {
  const last = done.at(-1);
  if (last === undefined) throw new Error('Aucune page lue');
  const at = modifiedAt(last);
  const ids = new Set(previous.at === at ? previous.ids : []);
  for (const stub of done) if (modifiedAt(stub) === at) ids.add(stub.id);
  return JSON.stringify({ at: new Date(at).toISOString(), ids: [...ids] });
}
