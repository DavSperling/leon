import type { ConnectorItem, ConnectorTurn } from '../types';
import { adfToText } from './adf';
import type { Comment, Issue } from './client';

// De la réponse de Jira à un élément du socle : la description est le tour `document`, daté de la
// dernière modification du ticket ; chaque commentaire garde sa propre date.

type User = Issue['fields']['creator'];

const author = (user: User): ConnectorTurn['author'] => ({
  name: user?.displayName || null,
  email: user?.emailAddress || null,
});

const byDate = (a: Comment, b: Comment) => Date.parse(a.created) - Date.parse(b.created);

// Un ticket sans description ni commentaire sort sans tours (le socle l'écarte) pour que le curseur avance.
export function toItem(site: string, issue: Issue, comments: Comment[]): ConnectorItem {
  const { fields, key } = issue;
  const turns: ConnectorTurn[] = [];
  const description = adfToText(fields.description);
  // À défaut de créateur (compte supprimé), le rapporteur signe le corps.
  if (description !== '') {
    turns.push({
      externalId: 'body',
      role: 'document',
      author: author(fields.creator ?? fields.reporter),
      text: description,
      ts: fields.updated,
    });
  }
  for (const comment of [...comments].sort(byDate)) {
    const text = adfToText(comment.body);
    if (text === '') continue;
    turns.push({
      externalId: `comment:${comment.id}`,
      role: 'participant',
      author: author(comment.author),
      text,
      ts: comment.created,
    });
  }
  // La clé (ACME-12) change quand le ticket change de projet : l'identifiant de l'élément reste l'id.
  return {
    externalId: `issue:${issue.id}`,
    nature: 'ticket',
    title: fields.summary ? `${key} ${fields.summary}` : key,
    url: `https://${site}.atlassian.net/browse/${encodeURIComponent(key)}`,
    updatedAt: fields.updated,
    origin: { site, ...(fields.project ? { project: fields.project.key } : {}) },
    turns,
  };
}
