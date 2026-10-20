import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Comment, Task } from './client';

// De la réponse de ClickUp à un élément du socle : la description est le tour `document`, datée
// de la dernière modification ; chaque commentaire garde sa propre date.

const isoDate = (millis: string): string => new Date(Number(millis)).toISOString();

const author = (person: Task['creator']): ConnectorTurn['author'] => ({
  name: person?.username ?? null,
  email: person?.email ?? null,
});

// Le Markdown d'abord ; une description vide dans un champ ne masque pas celle d'un autre.
const descriptionOf = (task: Task): string =>
  [task.markdown_description, task.description, task.text_content]
    .map((text) => text?.trim() ?? '')
    .find((text) => text !== '') ?? '';

function commentTurns(comments: Comment[]): ConnectorTurn[] {
  const byDate = (a: Comment, b: Comment) =>
    Number(a.date) - Number(b.date) || a.id.localeCompare(b.id);
  return [...comments].sort(byDate).flatMap((comment) => {
    const text = comment.comment_text?.trim();
    if (!text) return []; // une pièce jointe seule, par exemple
    const turn: ConnectorTurn = {
      externalId: `comment:${comment.id}`,
      role: 'participant',
      author: author(comment.user),
      text,
      ts: isoDate(comment.date),
    };
    return [turn];
  });
}

// Une tâche sans description ni commentaire n'est pas rendue : son titre seul n'apprend rien.
export function toItem(workspace: string, task: Task, comments: Comment[]): ConnectorItem | null {
  const updatedAt = isoDate(task.date_updated);
  const description = descriptionOf(task);
  const turns: ConnectorTurn[] = [];
  if (description !== '') {
    const body: ConnectorTurn = {
      externalId: 'body',
      role: 'document',
      author: author(task.creator),
      text: description,
      ts: updatedAt,
    };
    turns.push(body);
  }
  turns.push(...commentTurns(comments));
  if (turns.length === 0) return null;
  const folder = task.folder && !task.folder.hidden ? task.folder.name : null;
  return {
    externalId: `task:${task.id}`,
    nature: 'ticket',
    title: task.custom_id ? `${task.custom_id} ${task.name}` : task.name,
    url: task.url ?? null,
    updatedAt,
    origin: {
      workspace,
      ...(folder ? { folder } : {}),
      ...(task.list ? { list: task.list.name } : {}),
    },
    turns,
  };
}
