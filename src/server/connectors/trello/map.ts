import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Card, CardAction } from './client';

// De la réponse de Trello à un élément du socle : la ligne d'état puis la description sont deux tours `document`,
// datés de la dernière action ; chaque commentaire garde sa propre date.

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

// L'essentiel de ce que la carte montre dans Trello, en une ligne : « Liste : En cours · Échéance : 2026-10-31
// 16:00 UTC · Étiquettes : Urgent · Membres : Marie Durand ». L'échéance garde son heure : en date seule, elle
// changerait de jour selon le fuseau.
// shortcut: les checklists et les étiquettes sans nom (une couleur seule) ne sont pas gardées ; les lire (le
// paramètre `checklists` de la même requête) quand une équipe y range ses tâches.
// shortcut: une étiquette ou un membre ajouté ou retiré seul ne fait pas relire la carte (ces actions ne sont pas dans
// le filtre des actions du tableau, client.ts) : la ligne suit au prochain commentaire ou à la prochaine modification.
// Ajouter ces types d'action au filtre si une équipe trie ses cartes par étiquettes ou par membres.
const utcMinute = (ms: number) =>
  `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

function stateLine(list: string | null, card: Card): string {
  const due = Date.parse(card.due ?? '');
  const labels = (card.labels ?? []).flatMap((label) => label.name?.trim() || []);
  const members = (card.members ?? []).flatMap((member) => member.fullName?.trim() || []);
  return [
    list && `Liste : ${list}`,
    Number.isFinite(due) && `Échéance : ${utcMinute(due)}${card.dueComplete ? ' (terminée)' : ''}`,
    labels.length > 0 && `Étiquettes : ${labels.join(', ')}`,
    members.length > 0 && `Membres : ${members.join(', ')}`,
  ]
    .filter(Boolean)
    .join(' · ');
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
  // La ligne d'état a son propre tour : un tour gardé porte l'empreinte de son texte (normalize.ts), et une carte
  // déplacée ne doit pas recopier sa description. Une carte qui n'a que son titre garde ce seul tour.
  const state = stateLine(list, card);
  const etat: ConnectorTurn[] = state
    ? [
        {
          externalId: 'etat',
          role: 'document',
          author: { name: null, email: null },
          text: state,
          ts: updatedAt,
        },
      ]
    : [];
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
    turns: [...etat, ...body, ...comments],
  };
}
