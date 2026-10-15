import { htmlToText } from '../normalize';
import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Conversation, Person, Thread } from './client';

// De la réponse de Help Scout à un élément du socle : un tour `document` court (l'état de la
// conversation : statut, client, assigné, étiquettes), puis un tour `participant` par message, par
// note interne ou par appel, avec sa propre date.

const STATUS_LABELS: Record<string, string> = {
  active: 'ouverte',
  pending: 'en attente',
  closed: 'fermée',
};
const CHANNEL_LABELS: Record<string, string> = {
  email: 'e-mail',
  chat: 'messagerie instantanée',
  phone: 'téléphone',
};
// Un brouillon, un fil masqué ou en attente de confirmation n'a pas été dit au client.
const SKIPPED_STATES = new Set(['draft', 'hidden', 'review', 'underreview']);
// Un changement d'état (assignation, statut) n'a ni texte ni destinataire.
const SKIPPED_TYPES = new Set(['lineitem']);

const nameOf = (person: Person): string | null =>
  [person?.first, person?.last].filter(Boolean).join(' ') || null;

const labelled = (labels: Record<string, string>, key: string | null | undefined) =>
  key ? (labels[key] ?? key) : null;

function customerLine(person: Person): string | null {
  const name = nameOf(person);
  const email = person?.email ?? null;
  if (name && email) return `Client : ${name} (${email})`;
  return name || email ? `Client : ${name ?? email}` : null;
}

function stateText(conversation: Conversation, subject: string): string {
  const tags = conversation.tags?.map((entry) => entry.tag).join(', ');
  const status = labelled(STATUS_LABELS, conversation.status);
  const channel = labelled(CHANNEL_LABELS, conversation.type);
  const assignee = nameOf(conversation.assignee);
  const lines = [
    subject
      ? `Conversation n°${conversation.number} : ${subject}`
      : `Conversation n°${conversation.number}`,
    [status && `Statut : ${status}`, channel && `Canal : ${channel}`].filter(Boolean).join(' · '),
    customerLine(conversation.primaryCustomer),
    assignee && `Assignée à : ${assignee}`,
    tags && `Étiquettes : ${tags}`,
  ];
  return lines.filter(Boolean).join('\n');
}

// Help Scout ne donne pas la date de modification : la plus récente de toutes celles de la
// conversation et de ses fils (les changements d'état comptent).
function lastActivity(conversation: Conversation, threads: Thread[]): string {
  const dates = [conversation.createdAt, conversation.closedAt, conversation.userUpdatedAt];
  const all = [...dates, ...threads.map((thread) => thread.createdAt)].flatMap((date) =>
    date ? [Date.parse(date)] : [],
  );
  return new Date(Math.max(...all)).toISOString();
}

// Le fil d'un client est de lui ; pour les autres, `customer` est le destinataire, pas l'auteur.
function authorOf(thread: Thread): ConnectorTurn['author'] {
  const person =
    thread.type === 'customer' ? (thread.createdBy ?? thread.customer) : thread.createdBy;
  return { name: nameOf(person), email: person?.email ?? null };
}

function threadTurn(thread: Thread): ConnectorTurn | null {
  if (SKIPPED_TYPES.has(thread.type) || SKIPPED_STATES.has(thread.state ?? '')) return null;
  const text = htmlToText(thread.body ?? '');
  if (text === '') return null;
  return {
    externalId: `thread:${thread.id}`,
    role: 'participant',
    author: authorOf(thread),
    text: thread.type === 'note' ? `Note interne : ${text}` : text,
    ts: thread.createdAt,
  };
}

const byDate = (a: Thread, b: Thread) =>
  Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id;

// null : un pourriel, une conversation supprimée ou en brouillon, ou sans aucun texte.
export function toItem(conversation: Conversation): ConnectorItem | null {
  const { status, state } = conversation;
  if (status === 'spam' || state === 'deleted' || state === 'draft') return null;
  const threads = (conversation._embedded?.threads ?? []).filter((thread) => thread !== null);
  const replies = [...threads].sort(byDate).flatMap((thread) => threadTurn(thread) ?? []);
  if (replies.length === 0) return null;

  const updatedAt = lastActivity(conversation, threads);
  const subject = conversation.subject?.trim() ?? '';
  const body: ConnectorTurn = {
    externalId: 'body',
    role: 'document',
    author: { name: null, email: null },
    text: stateText(conversation, subject),
    ts: updatedAt,
  };
  return {
    externalId: `conversation:${conversation.id}`,
    nature: 'fil',
    title: subject || `Conversation n°${conversation.number}`,
    url: conversation._links?.web?.href ?? null,
    updatedAt,
    origin: conversation.mailboxId == null ? {} : { inbox: String(conversation.mailboxId) },
    turns: [body, ...replies],
  };
}
