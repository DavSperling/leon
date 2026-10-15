import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Issue, Note } from './client';

// De la réponse de Sentry à un élément du socle : un tour `document` court (état du problème à sa
// dernière occurrence, sans trace de pile ni données d'événement), puis une prise de parole par note.

const STATUS_LABELS: Record<string, string> = {
  unresolved: 'non résolu',
  resolved: 'résolu',
  ignored: 'ignoré',
};
const LEVEL_LABELS: Record<string, string> = {
  fatal: 'fatale',
  error: 'erreur',
  warning: 'avertissement',
  info: 'information',
  debug: 'débogage',
};

// Les dates arrivent en ISO 8601 (validées par le schéma) : « 2026-10-14 08:02 UTC ».
const when = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

function documentText(issue: Issue): string {
  const counts = [
    issue.count != null ? `Événements : ${issue.count}` : null,
    issue.userCount != null ? `Utilisateurs touchés : ${issue.userCount}` : null,
  ];
  const state = [
    issue.status ? `Statut : ${STATUS_LABELS[issue.status] ?? issue.status}` : null,
    issue.level ? `Niveau : ${LEVEL_LABELS[issue.level] ?? issue.level}` : null,
  ];
  const lines = [
    `Problème ${issue.shortId} : ${issue.title}`,
    `Projet : ${issue.project.name ?? issue.project.slug}`,
    state.filter(Boolean).join(' · '),
    issue.culprit ? `Lieu : ${issue.culprit}` : null,
    issue.firstSeen ? `Première occurrence : ${when(issue.firstSeen)}` : null,
    `Dernière occurrence : ${when(issue.lastSeen)}`,
    counts.filter(Boolean).join(' · '),
    issue.assignedTo?.name ? `Assigné à : ${issue.assignedTo.name}` : null,
  ];
  return lines.filter(Boolean).join('\n');
}

export function toItem(organization: string, issue: Issue, notes: Note[]): ConnectorItem {
  const body: ConnectorTurn = {
    externalId: 'body',
    role: 'document',
    author: { name: null, email: null },
    text: documentText(issue),
    ts: issue.lastSeen,
  };
  const replies = notes
    .filter((note) => note.text.trim() !== '')
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map(
      (note): ConnectorTurn => ({
        externalId: `note:${note.id}`,
        role: 'participant',
        author: note.author,
        text: note.text.trim(),
        ts: note.at,
      }),
    );
  return {
    externalId: `issue:${issue.id}`,
    nature: 'ticket',
    title: `${issue.shortId} ${issue.title}`,
    url: issue.permalink ?? null,
    updatedAt: issue.lastSeen,
    origin: { organization, project: issue.project.slug },
    turns: [body, ...replies],
  };
}
