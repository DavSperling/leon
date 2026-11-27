import type { ConnectorItem, ConnectorTurn } from '../types';
import type { LinearIssue, LinearProjectUpdate, LinearUser } from './client';

// Conversion des réponses de Linear en éléments. Le texte est déjà du Markdown.

const author = (user: LinearUser): ConnectorTurn['author'] => ({
  name: user?.name ?? null,
  email: user?.email ?? null,
});

const byDate = (a: { createdAt: string }, b: { createdAt: string }) =>
  Date.parse(a.createdAt) - Date.parse(b.createdAt);

// La priorité de Linear est un nombre ; 0, « aucune », n'est pas écrite.
const PRIORITIES: Record<number, string> = { 1: 'Urgente', 2: 'Haute', 3: 'Moyenne', 4: 'Basse' };

// L'essentiel du ticket en une ligne, avec les seuls champs remplis : « État : En cours · Assigné : … · Priorité :
// Haute · Labels : bug · Cycle : 12 · Échéance : 2026-12-03 ».
function stateLine(issue: LinearIssue): string {
  const labels = issue.labels.nodes.map((label) => label.name).join(', ');
  const cycle = issue.cycle && (issue.cycle.name || String(issue.cycle.number));
  const priority = PRIORITIES[issue.priority];
  return [
    issue.state.name && `État : ${issue.state.name}`,
    issue.assignee?.name && `Assigné : ${issue.assignee.name}`,
    priority && `Priorité : ${priority}`,
    labels && `Labels : ${labels}`,
    cycle && `Cycle : ${cycle}`,
    issue.dueDate && `Échéance : ${issue.dueDate}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

// Le corps est la ligne d'état puis la description : un ticket qui n'a qu'un titre garde sa ligne d'état.
export function issueToItem(issue: LinearIssue): ConnectorItem | null {
  const turns: ConnectorTurn[] = [];
  const body = [stateLine(issue), issue.description?.trim()].filter(Boolean).join('\n\n');
  // Le corps vaut à la date de la dernière modification du ticket.
  if (body) {
    const { creator, updatedAt } = issue;
    turns.push({
      externalId: 'body',
      role: 'document',
      author: author(creator),
      text: body,
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
    externalId: `issue:${issue.id}`,
    nature: 'ticket',
    title: `${issue.identifier} ${issue.title}`,
    url: issue.url,
    updatedAt: issue.updatedAt,
    origin: { team: issue.team.name, ...(issue.project ? { project: issue.project.name } : {}) },
    turns,
  };
}

export function projectUpdateToItem(update: LinearProjectUpdate): ConnectorItem | null {
  const text = update.body.trim();
  if (text === '') return null;
  return {
    externalId: `project-update:${update.id}`,
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
