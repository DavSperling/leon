import { ConnectorAuthError, ConnectorHttpError } from '../http';
import type { ConnectorItem, SyncPage, SyncState } from '../types';
import type { AirRecord, AirtableClient, Table } from './client';
import { betweenWindows, type Cursor, readCursor, resumePoint, WINDOW_MS } from './cursor';
import { toItem } from './map';

// La relève : les tables des bases demandées, une fenêtre de temps après l'autre (voir cursor.ts),
// par pages de 20 enregistrements (soit 20 requêtes de commentaires au plus par page).

const PAGE_ITEMS = 20;

type TableRef = { baseId: string; table: Table };
type Run = {
  air: AirtableClient;
  names: Map<string, string>;
  marks: Cursor;
  since: Date;
  end: number; // l'instant du début du passage : ce qui change ensuite attend le passage suivant
  commentsDenied: boolean;
};

const byId = (a: AirRecord, b: AirRecord) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

async function commentsOf(run: Run, ref: TableRef, record: AirRecord) {
  if (record.commentCount === 0 || run.commentsDenied) return [];
  try {
    return await run.air.comments(ref.baseId, ref.table.id, record.id);
  } catch (error) {
    const denied = error instanceof ConnectorAuthError && error.status === 403;
    const missing = error instanceof ConnectorHttpError && error.status === 404;
    if (denied) run.commentsDenied = true;
    if (denied || missing) return [];
    throw error;
  }
}

async function readChunk(run: Run, ref: TableRef, records: AirRecord[], at: number) {
  const items: ConnectorItem[] = [];
  for (const record of records) {
    const comments = await commentsOf(run, ref, record);
    const baseName = run.names.get(ref.baseId) ?? ref.baseId;
    const item = toItem({ baseId: ref.baseId, baseName, table: ref.table, record, comments, at });
    if (item) items.push(item);
  }
  return items;
}

async function* syncTable(run: Run, ref: TableRef): AsyncGenerator<SyncPage> {
  const key = `${ref.baseId}/${ref.table.id}`;
  let mark = resumePoint(run.marks[key], run.since);
  let sent = JSON.stringify(run.marks);
  while (mark.from < run.end) {
    const { after } = mark;
    const to = mark.to ?? Math.min(mark.from + WINDOW_MS, run.end);
    const all = await run.air.records(ref.baseId, ref.table.id, mark.from, to);
    const records = all.filter((record) => after === null || record.id > after).sort(byId);
    for (let first = 0; first < records.length; first += PAGE_ITEMS) {
      const chunk = records.slice(first, first + PAGE_ITEMS);
      const items = await readChunk(run, ref, chunk, to);
      const lastChunk = first + PAGE_ITEMS >= records.length;
      const lastId = (chunk.at(-1) as AirRecord).id;
      mark = lastChunk ? betweenWindows(to) : { from: mark.from, to, after: lastId };
      run.marks[key] = mark;
      sent = JSON.stringify(run.marks);
      yield { items, cursor: sent };
    }
    mark = betweenWindows(to);
    run.marks[key] = mark;
  }
  // Des fenêtres sans rien dedans : le curseur avance quand même, pour ne pas les relire.
  const cursor = JSON.stringify(run.marks);
  if (cursor !== sent) yield { items: [], cursor };
}

export async function* syncBases(
  air: AirtableClient,
  bases: string[],
  state: SyncState,
): AsyncGenerator<SyncPage> {
  const names = await air.baseNames();
  const refs: TableRef[] = [];
  for (const baseId of new Set(bases)) {
    for (const table of await air.tables(baseId)) refs.push({ baseId, table });
  }
  const stored = readCursor(state.cursor);
  const marks: Cursor = {}; // seulement les tables d'aujourd'hui
  for (const { baseId, table } of refs) {
    const mark = stored[`${baseId}/${table.id}`];
    if (mark) marks[`${baseId}/${table.id}`] = mark;
  }
  const run: Run = {
    air,
    names,
    marks,
    since: state.since,
    end: Date.now(),
    commentsDenied: false,
  };
  for (const ref of refs) yield* syncTable(run, ref);
}
