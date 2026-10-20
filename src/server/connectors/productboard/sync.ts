import type { SyncPage } from '../types';
import type { ProductboardClient } from './client';
import { advance, isDone, type Mark, readCursor } from './cursor';
import { dated, toItem } from './map';

const PAGE_ITEMS = 100; // éléments rendus par page, au plus

// Chaque passage relit les notes modifiées depuis le curseur (Productboard les rend de la plus
// récemment créée à la plus ancienne, sans tri par modification), les trie ici de la plus anciennement
// modifiée à la plus récente, et avance le curseur note après note. Le socle s'arrête à 200 éléments
// par passage et reprend une minute plus tard : un gros retard se relit donc plusieurs fois.
export async function* syncNotes(
  client: ProductboardClient,
  workspace: string | undefined,
  state: { cursor: string | null; since: Date },
): AsyncGenerator<SyncPage> {
  const mark = readCursor(state.cursor);
  const from = mark ? new Date(mark.at) : state.since;
  const notes = dated(await client.notesUpdatedFrom(from))
    .filter(({ note, at }) => !isDone(mark, state.since, { at, id: note.id }))
    .sort((a, b) => a.at - b.at || a.note.id.localeCompare(b.note.id));

  let current: Mark | undefined = mark;
  for (let first = 0; first < notes.length; first += PAGE_ITEMS) {
    const items: SyncPage['items'] = [];
    for (const entry of notes.slice(first, first + PAGE_ITEMS)) {
      const item = toItem(entry, workspace);
      if (item) items.push(item);
      current = advance(current, { at: entry.at, id: entry.note.id });
    }
    yield { items, cursor: JSON.stringify(current) };
  }
}
