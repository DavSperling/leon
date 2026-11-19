import type { ConnectorItem, ConnectorTurn } from '../types';
import type { LinearIssue, LinearProjectUpdate, LinearUser } from './client';

// Conversion des réponses de Linear en éléments. Le texte est déjà du Markdown.

// Ce que devient un nœud lu : un élément, l'externalId d'un élément à retirer, ou null (rien à rendre).
export type Converted = ConnectorItem | { removed: string } | null;

// Leon rend un élément visible de toute l'équipe : seul ce que tout l'espace Linear voit peut y entrer.
// Une équipe privée, ou restreinte (dans le périmètre d'une équipe privée), n'est vue que de ses membres ;
// un projet dont une équipe n'est pas publique compte comme caché. Déjà relevé, l'élément est retiré
// (un ticket passé dans une équipe privée).
const isPublic = (teams: Array<{ visibility: string }>) =>
  teams.length > 0 && teams.every((team) => team.visibility === 'public');

const author = (user: LinearUser): ConnectorTurn['author'] => ({
  name: user?.name ?? null,
  email: user?.email ?? null,
});

const byDate = (a: { createdAt: string }, b: { createdAt: string }) =>
  Date.parse(a.createdAt) - Date.parse(b.createdAt);

// Un ticket sans description ni commentaire n'est pas rendu : son titre seul n'apprend rien.
export function issueToItem(issue: LinearIssue): Converted {
  const externalId = `issue:${issue.id}`;
  if (!isPublic([issue.team])) return { removed: externalId };
  const turns: ConnectorTurn[] = [];
  const description = issue.description?.trim();
  // Le corps vaut à la date de la dernière modification du ticket.
  if (description) {
    const { creator, updatedAt } = issue;
    turns.push({
      externalId: 'body',
      role: 'document',
      author: author(creator),
      text: description,
      ts: updatedAt,
    });
  }
  for (const comment of [...issue.comments.nodes].sort(byDate)) {
    if (comment.body.trim() === '') continue;
    turns.push({
      externalId: `comment:${comment.id}`,
      role: 'participant',
      author: author(comment.user),
      text: comment.body,
      ts: comment.createdAt,
    });
  }
  if (turns.length === 0) return null;
  // L'identifiant lisible (LEO-12) change quand le ticket change d'équipe : on garde l'id.
  return {
    externalId,
    nature: 'ticket',
    title: `${issue.identifier} ${issue.title}`,
    url: issue.url,
    updatedAt: issue.updatedAt,
    origin: { team: issue.team.name, ...(issue.project ? { project: issue.project.name } : {}) },
    turns,
  };
}

export function projectUpdateToItem(update: LinearProjectUpdate): Converted {
  const externalId = `project-update:${update.id}`;
  if (!isPublic(update.project.teams.nodes)) return { removed: externalId };
  const text = update.body.trim();
  if (text === '') return null;
  return {
    externalId,
    nature: 'note',
    title: `Mise à jour du projet ${update.project.name}`,
    url: update.url,
    updatedAt: update.updatedAt,
    origin: { project: update.project.name },
    turns: [
      {
        externalId: 'body',
        role: 'document',
        author: author(update.user),
        text,
        ts: update.updatedAt,
      },
    ],
  };
}
