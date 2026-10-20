import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Listed, Note, Stream } from './client';

// De la réponse de GitLab à un élément du socle : la description est le tour `document`, datée de
// la dernière modification ; chaque note garde sa propre date.

// « issue:acme/leon#12 », « mr:acme/leon!7 » : le signe est celui que GitLab écrit dans ses références.
const KINDS: Record<Stream, { id: string; sign: string }> = {
  issues: { id: 'issue', sign: '#' },
  merge_requests: { id: 'mr', sign: '!' },
};

type Row = { author?: Listed['author'] };

const authorOf = (row: Row) => ({
  name: row.author?.name?.trim() || row.author?.username || null,
  email: null,
});

// Un tour sans texte n'existe pas (description nulle ou vide).
function turn(
  externalId: string,
  role: ConnectorTurn['role'],
  row: Row & { text?: string | null },
  ts: string,
): ConnectorTurn | null {
  const text = row.text?.trim();
  if (!text) return null;
  return { externalId, role, author: authorOf(row), text, ts };
}

function isTurn(value: ConnectorTurn | null): value is ConnectorTurn {
  return value !== null;
}

// Les notes système (« a fermé le ticket ») ne sont pas des propos : elles ne sont pas reprises.
export function toItem(
  stream: Stream,
  project: string,
  listed: Listed,
  notes: Note[],
): ConnectorItem {
  const { id, sign } = KINDS[stream];
  const replies = notes
    .filter((note) => !note.system)
    .map((note) =>
      turn(`note:${note.id}`, 'participant', { ...note, text: note.body }, note.created_at),
    )
    .filter(isTurn)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const body = turn('body', 'document', { ...listed, text: listed.description }, listed.updated_at);
  return {
    externalId: `${id}:${project}${sign}${listed.iid}`,
    nature: 'ticket',
    title: `${sign}${listed.iid} ${listed.title}`,
    url: listed.web_url,
    updatedAt: listed.updated_at,
    origin: { project },
    turns: [body, ...replies].filter(isTurn),
  };
}
