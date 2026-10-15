import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Ticket, TicketComments, User } from './client';

// De la réponse de Zendesk à un élément du socle. Le tour `document` est l'état du ticket (objet,
// statut, priorité, étiquettes), daté de sa dernière modification : un changement d'état crée un
// nouveau tour, l'ancien reste. Chaque commentaire, public ou interne, garde sa propre date ; le
// premier est le texte de la demande, d'où l'absence de `description` dans l'état.

const STATUS = new Map([
  ['new', 'nouveau'],
  ['open', 'ouvert'],
  ['pending', 'en attente'],
  ['hold', 'en pause'],
  ['solved', 'résolu'],
  ['closed', 'clos'],
]);
const PRIORITY = new Map([
  ['urgent', 'urgente'],
  ['high', 'haute'],
  ['normal', 'normale'],
  ['low', 'basse'],
]);
const TYPE = new Map([
  ['problem', 'problème'],
  ['task', 'tâche'],
]);

const label = (names: Map<string, string>, value: string) => names.get(value) ?? value;

function stateText(ticket: Ticket): string {
  const subject = ticket.subject?.trim();
  const lines = [subject ? `Ticket ${ticket.id} : ${subject}` : `Ticket ${ticket.id}`];
  if (ticket.status) lines.push(`Statut : ${label(STATUS, ticket.status)}`);
  if (ticket.priority) lines.push(`Priorité : ${label(PRIORITY, ticket.priority)}`);
  if (ticket.type) lines.push(`Type : ${label(TYPE, ticket.type)}`);
  if (ticket.tags?.length) lines.push(`Étiquettes : ${ticket.tags.join(', ')}`);
  return lines.join('\n');
}

// Un auteur absent de la liste (compte supprimé, système) sort sans nom ni côté. Le côté vient du
// rôle du compte : un client (« end-user ») est extérieur, un agent ou un administrateur est l'équipe.
function authorOf(users: Map<number, User>, id: number | null | undefined) {
  const user = id === null || id === undefined ? undefined : users.get(id);
  const side: ConnectorTurn['side'] = !user?.role
    ? undefined
    : user.role === 'end-user'
      ? 'external'
      : 'team';
  return { author: { name: user?.name || null, email: user?.email || null }, side };
}

// Un ticket sans commentaire lisible sort avec son seul état.
export function toItem(
  subdomain: string,
  ticket: Ticket,
  { comments, users }: TicketComments,
): ConnectorItem {
  const turns: ConnectorTurn[] = [
    {
      externalId: 'body',
      role: 'document',
      // L'objet du ticket est celui de la personne qui l'a ouvert : le tour prend son côté.
      ...authorOf(users, ticket.submitter_id),
      text: stateText(ticket),
      ts: ticket.updated_at,
    },
  ];
  for (const comment of comments) {
    const text = (comment.plain_body || comment.body || '').trim();
    if (text === '') continue;
    turns.push({
      externalId: `comment:${comment.id}`,
      role: 'participant',
      ...authorOf(users, comment.author_id),
      internalNote: comment.public === false,
      text,
      ts: comment.created_at,
    });
  }
  const subject = ticket.subject?.trim();
  return {
    externalId: `ticket:${ticket.id}`,
    nature: 'fil',
    title: subject ? `#${ticket.id} ${subject}` : `#${ticket.id}`,
    url: `https://${subdomain}.zendesk.com/agent/tickets/${ticket.id}`,
    updatedAt: ticket.updated_at,
    origin: { subdomain },
    turns,
  };
}
