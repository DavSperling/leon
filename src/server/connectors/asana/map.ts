import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Comment, Task } from './client';

// De la réponse d'Asana à un élément du socle : la description est le tour `document`, datée de la
// dernière modification de la tâche ; chaque commentaire garde sa propre date. Asana donne des
// dates ISO 8601 en UTC avec millisecondes : aucune conversion.

type Origin = { workspace: string; project: string };

const author = (user: { name?: string | null } | null | undefined): ConnectorTurn['author'] => ({
  name: user?.name ?? null,
  email: null, // l'adresse demanderait une requête par utilisateur
});

const byDate = (a: Comment, b: Comment) => Date.parse(a.created_at) - Date.parse(b.created_at);

// Une tâche sans description ni commentaire n'est pas rendue : son titre seul n'apprend rien.
export function toItem(task: Task, comments: Comment[], origin: Origin): ConnectorItem | null {
  const turns: ConnectorTurn[] = [];
  const notes = task.notes?.trim();
  if (notes) {
    turns.push({
      externalId: 'body',
      role: 'document',
      author: author(task.created_by),
      text: notes,
      ts: task.modified_at,
    });
  }
  for (const comment of [...comments].sort(byDate)) {
    // Le filtre de la requête ne laisse que des commentaires ; on ne se fie pas qu'à lui.
    const text = comment.text?.trim();
    if (comment.resource_subtype !== 'comment_added' || !text) continue;
    turns.push({
      externalId: `comment:${comment.gid}`,
      role: 'participant',
      author: author(comment.created_by),
      text,
      ts: comment.created_at,
    });
  }
  if (turns.length === 0) return null;
  return {
    externalId: `task:${task.gid}`,
    nature: 'ticket',
    title: task.name.trim() || 'Tâche sans titre',
    url: task.permalink_url ?? null,
    updatedAt: task.modified_at,
    origin: { workspace: origin.workspace, project: origin.project },
    turns,
  };
}
