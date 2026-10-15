import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Conversation, Message } from './client';

// De la réponse de Crisp à un élément du socle : une conversation est un fil, sans tour `document` ;
// chaque message de texte est une prise de parole datée de son envoi, au nom du visiteur ou de
// l'opérateur. Les dates de Crisp sont des millisecondes depuis 1970.

export const toIso = (ms: number): string => new Date(ms).toISOString();

type Meta = NonNullable<Conversation['meta']>;

// Seuls les messages de texte et les notes internes (contenu en chaîne) sont lus : les fichiers,
// les sons et les événements du système (« conversation résolue ») n'ont pas de texte à retenir.
function turnOf(message: Message, meta: Meta | null | undefined): ConnectorTurn | null {
  const { type, content, fingerprint } = message;
  if ((type !== 'text' && type !== 'note') || typeof content !== 'string') return null;
  const text = content.trim();
  if (!text || fingerprint === undefined) return null;
  const visitor = message.from === 'user';
  // Le côté vient du champ `from` de Crisp, pas du pseudo : le visiteur choisit le sien.
  const side = visitor ? 'external' : message.from === 'operator' ? 'team' : undefined;
  return {
    externalId: `message:${fingerprint}`,
    role: 'participant',
    // Crisp ne donne l'adresse que du visiteur, par la fiche de la conversation.
    author: {
      name: message.user?.nickname?.trim() || (visitor ? meta?.nickname?.trim() : null) || null,
      email: (visitor ? meta?.email?.trim() : null) || null,
    },
    side,
    // Une note interne n'a pas été envoyée au client : le modèle doit pouvoir le voir.
    internalNote: type === 'note',
    text,
    ts: toIso(message.timestamp),
  };
}

function titleOf(meta: Meta | null | undefined): string {
  const subject = meta?.subject?.trim();
  if (subject) return subject;
  return `Conversation avec ${meta?.nickname?.trim() || meta?.email?.trim() || 'un visiteur'}`;
}

export function toItem(
  conversation: Conversation,
  messages: Message[],
  websiteId: string,
): ConnectorItem {
  const turns = [...messages]
    .sort((a, b) => a.timestamp - b.timestamp || (a.fingerprint ?? 0) - (b.fingerprint ?? 0))
    .map((message) => turnOf(message, conversation.meta))
    .filter((turn): turn is ConnectorTurn => turn !== null);
  return {
    externalId: `conversation:${conversation.session_id}`,
    nature: 'fil',
    title: titleOf(conversation.meta),
    // Le format du lien vers la boîte de réception n'est pas dans la doc de l'API (voir connector.ts).
    url: `https://app.crisp.chat/website/${websiteId}/inbox/${encodeURIComponent(conversation.session_id)}/`,
    updatedAt: toIso(conversation.updated_at),
    origin: { site: websiteId },
    turns,
  };
}
