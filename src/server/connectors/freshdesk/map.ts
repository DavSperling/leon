import { htmlToText } from '../normalize';
import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Conversation, Person, Ticket } from './client';

// De la réponse de Freshdesk à un élément du socle : la description est le tour `document`, datée
// de la dernière modification du ticket et au nom du demandeur ; chaque conversation (réponse ou
// note interne) garde sa propre date.

const NOBODY: Person = { name: null, email: null };

// Le texte brut quand Freshdesk le donne, sinon le HTML passé en texte.
const textOf = (plain: string | null | undefined, html: string | null | undefined): string =>
  plain?.trim() || htmlToText(html ?? '').trim();

// « Nom <adresse> » ou « adresse » : seule l'adresse est gardée.
const addressOf = (header: string | null | undefined): string | null =>
  /[^\s<>"]+@[^\s<>"]+/.exec(header ?? '')?.[0] ?? null;

const requesterOf = (ticket: Ticket): Person =>
  ticket.requester
    ? { name: ticket.requester.name?.trim() || null, email: ticket.requester.email?.trim() || null }
    : NOBODY;

// Le demandeur, puis un agent de l'annuaire, puis l'adresse de l'expéditeur.
function authorOf(ticket: Ticket, agents: Map<number, Person>, conversation: Conversation): Person {
  const id = conversation.user_id;
  if (id != null && ticket.requester && id === ticket.requester.id) return requesterOf(ticket);
  return (
    (id == null ? undefined : agents.get(id)) ?? {
      name: null,
      email: addressOf(conversation.from_email),
    }
  );
}

function replyTurn(
  ticket: Ticket,
  agents: Map<number, Person>,
  row: Conversation,
): ConnectorTurn | null {
  const text = textOf(row.body_text, row.body);
  if (text === '') return null;
  return {
    externalId: `conversation:${row.id}`,
    role: 'participant',
    author: authorOf(ticket, agents, row),
    // Une note interne n'a pas été lue par le client : le modèle doit le savoir.
    text: row.private ? `[Note interne]\n${text}` : text,
    ts: row.created_at,
  };
}

// Un ticket sans description ni conversation sort sans tours (le socle l'écarte) pour que le curseur avance.
export function toItem(
  domain: string,
  ticket: Ticket,
  conversations: Conversation[],
  agents: Map<number, Person>,
): ConnectorItem {
  const description = textOf(ticket.description_text, ticket.description);
  const body: ConnectorTurn[] =
    description === ''
      ? []
      : [
          {
            externalId: 'body',
            role: 'document',
            author: requesterOf(ticket),
            text: description,
            ts: ticket.updated_at,
          },
        ];
  const replies = [...conversations]
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .map((row) => replyTurn(ticket, agents, row))
    .filter((turn): turn is ConnectorTurn => turn !== null);
  // Les groupes et les entreprises ne sont connus que par leur numéro (leurs noms coûteraient des
  // requêtes de plus) : `origin` les garde pour la future couche de droits.
  return {
    externalId: `ticket:${ticket.id}`,
    nature: 'fil',
    title: ticket.subject ? `#${ticket.id} ${ticket.subject}` : `#${ticket.id}`,
    url: `https://${domain}.freshdesk.com/a/tickets/${ticket.id}`,
    updatedAt: ticket.updated_at,
    origin: {
      domain,
      ...(ticket.group_id == null ? {} : { group: String(ticket.group_id) }),
      ...(ticket.company_id == null ? {} : { company: String(ticket.company_id) }),
    },
    turns: [...body, ...replies],
  };
}
