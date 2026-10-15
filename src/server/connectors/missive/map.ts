import { htmlToText } from '../normalize';
import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Comment, Conversation, Message } from './schemas';

// De la réponse de Missive à un élément du socle : une conversation est un fil, chaque message et
// chaque commentaire un tour `participant` daté de son envoi. Aucun tour `document` : il n'y a pas
// de corps de page ou de ticket, seulement des échanges.

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
type Timed = { at: number; turn: ConnectorTurn };

function messageTurn(message: Message): Timed | null {
  // Le corps est du HTML ; refusé, il reste l'aperçu.
  const text = (message.body !== null ? htmlToText(message.body) : (message.preview ?? '')).trim();
  if (text === '') return null;
  const writer = message.author;
  const sender = message.from_field;
  // Un message sortant part de l'adresse commune du support : l'auteur est la personne qui l'a écrit.
  const author =
    writer && (writer.name || writer.email)
      ? { name: writer.name ?? null, email: writer.email ?? null }
      : { name: sender?.name ?? sender?.username ?? null, email: sender?.address ?? null };
  const turn: ConnectorTurn = {
    externalId: `message:${message.id}`,
    role: 'participant',
    author,
    text,
    ts: iso(message.delivered_at),
  };
  return { at: message.delivered_at, turn };
}

function commentTurn(comment: Comment): Timed | null {
  const text = (comment.body ?? '').trim();
  if (text === '') return null;
  const turn: ConnectorTurn = {
    externalId: `comment:${comment.id}`,
    role: 'participant',
    author: { name: comment.author?.name ?? null, email: comment.author?.email ?? null },
    text,
    ts: iso(comment.created_at),
  };
  return { at: comment.created_at, turn };
}

// Sans aucun texte lisible (invité, messages vides), la conversation n'est pas rendue.
export function toItem(
  conversation: Conversation,
  messages: Message[],
  comments: Comment[],
): ConnectorItem | null {
  const timed = [...messages.map(messageTurn), ...comments.map(commentTurn)].flatMap(
    (entry) => entry ?? [],
  );
  if (timed.length === 0) return null;
  timed.sort((a, b) => a.at - b.at);
  const origin: Record<string, string> = {};
  if (conversation.organization?.name) origin.organization = conversation.organization.name;
  if (conversation.team?.name) origin.team = conversation.team.name;
  if (conversation.shared_label_names) origin.labels = conversation.shared_label_names;
  return {
    externalId: `conversation:${conversation.id}`,
    nature: 'fil',
    title:
      (conversation.subject || conversation.latest_message_subject || '').trim() || 'Sans objet',
    url: conversation.web_url ?? null,
    updatedAt: iso(conversation.last_activity_at),
    origin,
    turns: timed.map((entry) => entry.turn),
  };
}
