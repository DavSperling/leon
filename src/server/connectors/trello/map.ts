import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Card, CardAction } from './client';

// De la réponse de Trello à un élément du socle : la description est le tour `document`, daté de
// la dernière action ; chaque commentaire garde sa propre date.

const nameOf = (member: CardAction['memberCreator']): string | null =>
  member?.fullName?.trim() || member?.username || null;

// Un commentaire sans texte ou à la date illisible n'existe pas.
function commentTurn(action: CardAction): ConnectorTurn[] {
  const text = action.data?.text?.trim();
  const ms = Date.parse(action.date);
  if (!text || !Number.isFinite(ms)) return [];
  return [
    {
      externalId: `comment:${action.id}`,
      role: 'participant',
      author: { name: nameOf(action.memberCreator), email: null },
      text,
      ts: new Date(ms).toISOString(),
    },
  ];
}

export function toItem(input: {
  board: string;
  list: string | null;
  card: Card;
  updatedAt: string; // la dernière action de la carte, en ISO canonique
}): ConnectorItem {
  const { board, list, card, updatedAt } = input;
  const actions = card.actions ?? [];
  const creator = actions.find((action) => action.type === 'createCard')?.memberCreator;
  const description = card.desc?.trim();
  const body: ConnectorTurn[] = description
    ? [
        {
          externalId: 'body',
          role: 'document',
          author: { name: nameOf(creator), email: null },
          text: description,
          ts: updatedAt,
        },
      ]
    : [];
  const comments = actions
    .filter((action) => action.type === 'commentCard')
    .flatMap(commentTurn)
    .sort(
      (a, b) => Date.parse(a.ts) - Date.parse(b.ts) || a.externalId.localeCompare(b.externalId),
    );
  return {
    externalId: `card:${card.id}`,
    nature: 'ticket',
    title: card.name,
    url: card.url ?? card.shortUrl ?? null,
    updatedAt,
    origin: list ? { board, list } : { board },
    turns: [...body, ...comments],
  };
}
