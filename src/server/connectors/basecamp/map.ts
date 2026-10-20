import { htmlToText } from '../normalize';
import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Comment, Item, Kind } from './client';

// De la réponse de Basecamp à un élément du socle : le corps est le tour `document`, daté de la
// dernière modification ; chaque commentaire garde sa propre date.

const NATURES: Record<Kind, ConnectorItem['nature']> = { message: 'fil', document: 'page' };

type Person = Item['creator'];

const authorOf = (person: Person) => ({
  name: person?.name.trim() || null,
  email: person?.email_address?.trim() || null,
});

// Le côté vient du champ `client` de Basecamp, jamais du nom : un client invité sur un projet parle
// de l'extérieur. Un auteur dont Basecamp ne dit rien n'a pas de côté.
function sideOf(person: Person): ConnectorTurn['side'] {
  if (person?.client === true) return 'external';
  return person?.client === false ? 'team' : undefined;
}

// Un tour sans texte n'existe pas (contenu absent ou vide).
function turn(
  externalId: string,
  role: ConnectorTurn['role'],
  person: Person,
  html: string | null | undefined,
  ts: string,
): ConnectorTurn | null {
  const text = htmlToText(html ?? '').trim();
  if (!text) return null;
  return { externalId, role, author: authorOf(person), side: sideOf(person), text, ts };
}

const isTurn = (value: ConnectorTurn | null): value is ConnectorTurn => value !== null;

// Un élément sans texte ni commentaire n'est pas rendu : son titre seul n'apprend rien.
export function toItem(
  kind: Kind,
  account: string,
  item: Item,
  comments: Comment[],
): ConnectorItem | null {
  const replies = comments
    .map((comment) =>
      turn(
        `comment:${comment.id}`,
        'participant',
        comment.creator,
        comment.content,
        comment.created_at,
      ),
    )
    .filter(isTurn)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const body = turn('body', 'document', item.creator, item.content, item.updated_at);
  const turns = [body, ...replies].filter(isTurn);
  if (turns.length === 0) return null;
  return {
    externalId: `${kind}:${item.id}`,
    nature: NATURES[kind],
    title: item.title,
    url: item.app_url ?? null,
    updatedAt: item.updated_at,
    origin: { account, ...(item.bucket ? { project: item.bucket.name } : {}) },
    turns,
  };
}
