import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Comment, Note, Thread } from './client';
import type { Stamp } from './cursor';
import type { Author, Parent, WhoIs } from './directory';

// De la réponse d'Attio à un élément du socle. Une note est un tour `document` daté de sa création
// (Attio ne donne pas de date de modification). Un fil de commentaires est un élément `fil` dont
// chaque commentaire est un tour `participant` avec sa propre date.

const isoDate = (text: string): string => new Date(Date.parse(text)).toISOString();

export const noteStamp = (note: Note): Stamp => ({
  at: Date.parse(note.created_at),
  id: note.id.note_id,
});
// Un fil vaut à l'instant de son dernier commentaire.
export const threadStamp = (thread: Thread): Stamp => ({
  at: Math.max(
    Date.parse(thread.created_at),
    ...thread.comments.map((c) => Date.parse(c.created_at)),
  ),
  id: thread.id.thread_id,
});

const withName = (label: string, parent: Parent | null): string =>
  parent?.name ? `${label} (${parent.name})` : label;

// Une note sans texte n'est pas rendue : son titre seul n'apprend rien.
export function noteItem(note: Note, parent: Parent | null, author: Author): ConnectorItem | null {
  const text = note.content_plaintext?.trim() ?? '';
  if (text === '') return null;
  const createdAt = isoDate(note.created_at);
  return {
    externalId: `note:${note.id.note_id}`,
    nature: 'note',
    title: withName(note.title?.trim() || 'Note', parent),
    url: parent?.url ?? null,
    updatedAt: createdAt,
    origin: { object: note.parent_object, ...(parent?.name ? { record: parent.name } : {}) },
    turns: [{ externalId: 'body', role: 'document', author, text, ts: createdAt }],
  };
}

function commentTurns(comments: Comment[], whoIs: WhoIs): ConnectorTurn[] {
  const byDate = (a: Comment, b: Comment) =>
    Date.parse(a.created_at) - Date.parse(b.created_at) ||
    a.id.comment_id.localeCompare(b.id.comment_id);
  return [...comments].sort(byDate).flatMap((comment) => {
    const text = comment.content_plaintext?.trim() ?? '';
    if (text === '') return []; // une pièce jointe seule, par exemple
    const turn: ConnectorTurn = {
      externalId: `comment:${comment.id.comment_id}`,
      role: 'participant',
      author: whoIs(comment.author),
      text,
      ts: isoDate(comment.created_at),
    };
    return [turn];
  });
}

export function threadItem(
  thread: Thread,
  parent: Parent | null,
  whoIs: WhoIs,
): ConnectorItem | null {
  const turns = commentTurns(thread.comments, whoIs);
  if (turns.length === 0) return null;
  return {
    externalId: `thread:${thread.id.thread_id}`,
    nature: 'fil',
    title: parent?.name ? `Fil de commentaires sur ${parent.name}` : 'Fil de commentaires',
    url: parent?.url ?? null,
    updatedAt: new Date(threadStamp(thread).at).toISOString(),
    origin: parent?.name ? { record: parent.name } : {},
    turns,
  };
}
