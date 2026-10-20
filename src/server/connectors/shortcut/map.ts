import type { ConnectorItem, ConnectorTurn } from '../types';
import { type Comment, type Person, type Story, stampOf } from './client';

// De la réponse de Shortcut à un élément du socle : la description est le tour `document`, datée de
// la dernière modification et au nom de la personne qui a demandé l'histoire ; chaque commentaire
// garde sa propre date.

const NOBODY: Person = { name: null, email: null };

const authorOf = (people: Map<string, Person>, id: string | null | undefined): Person =>
  (id ? people.get(id) : undefined) ?? NOBODY;

// Un tour sans texte n'existe pas (description absente ou vide, commentaire supprimé).
function turn(
  externalId: string,
  role: ConnectorTurn['role'],
  author: Person,
  text: string | null | undefined,
  ts: string,
): ConnectorTurn | null {
  const trimmed = text?.trim();
  return trimmed ? { externalId, role, author, text: trimmed, ts } : null;
}

function isTurn(value: ConnectorTurn | null): value is ConnectorTurn {
  return value !== null;
}

// Les épics et les projets ne sont connus que par leur numéro (leurs noms coûteraient deux requêtes
// de plus à chaque passage) : `origin` garde ces numéros pour la future couche de droits.
function originOf(story: Story): Record<string, string> {
  return {
    ...(story.project_id == null ? {} : { project: String(story.project_id) }),
    ...(story.epic_id == null ? {} : { epic: String(story.epic_id) }),
  };
}

export function toItem(
  story: Story,
  comments: Comment[],
  people: Map<string, Person>,
): ConnectorItem {
  const stamp = stampOf(story);
  const replies = comments
    .filter((comment) => !comment.deleted)
    .map((comment) =>
      turn(
        `comment:${comment.id}`,
        'participant',
        authorOf(people, comment.author_id),
        comment.text,
        comment.created_at,
      ),
    )
    .filter(isTurn)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const body = turn(
    'body',
    'document',
    authorOf(people, story.requested_by_id),
    story.description,
    stamp,
  );
  return {
    externalId: `story:${story.id}`,
    nature: 'ticket',
    title: `#${story.id} ${story.name}`,
    url: story.app_url,
    updatedAt: stamp,
    origin: originOf(story),
    turns: [body, ...replies].filter(isTurn),
  };
}
