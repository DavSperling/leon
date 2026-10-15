import { htmlToText } from '../normalize';
import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Author, Conversation, Part } from './client';

// De la réponse d'Intercom à un élément du socle : un tour participant par message, signé et daté
// de sa propre date. Le premier message est le « source » de la recherche ; les suivants, les
// parties du détail. Une note interne est un message de l'équipe, marqué comme tel.

type Side = 'client' | 'team' | 'bot';
type Person = { name: string | null; email: string | null };

const SIDE_LABEL: Record<Side, string> = {
  client: 'client',
  team: 'équipe',
  bot: 'assistant automatique',
};
// Les autres types de parties (affectation, ouverture, fermeture, mise en attente…) n'ont pas de texte.
const NOTE_TYPES = new Set(['note', 'note_and_reopen']);
const NOTE_PREFIX = 'Note interne : ';

function sideOf(author: Author): Side {
  if (author.type === 'bot' || author.from_ai_agent || author.is_ai_answer) return 'bot';
  return author.type === 'admin' || author.type === 'team' ? 'team' : 'client';
}

// Qui est qui dans cette conversation : la fiche d'un auteur de partie ne porte pas toujours son
// nom, que le premier message, la liste des équipiers ou une autre partie donnent.
function directoryOf(conversation: Conversation, detail: Conversation | null) {
  const people = new Map<string, Person>();
  const learn = (side: Side, author: Author | null | undefined) => {
    const name = author?.name?.trim() || null;
    const email = author?.email?.trim() || null;
    const key = `${side}:${author?.id}`;
    if (author?.id && (name || email) && !people.has(key)) people.set(key, { name, email });
  };
  const source = conversation.source?.author;
  if (source) learn(sideOf(source), source);
  for (const mate of detail?.teammates?.teammates ?? []) learn('team', mate);
  for (const part of detail?.conversation_parts?.conversation_parts ?? []) {
    if (part.author) learn(sideOf(part.author), part.author);
  }
  return people;
}

// Le nom suivi du côté (« Marie Durand (équipe) ») : le modèle attribue les engagements d'après
// l'auteur, et le fil ne dit pas autrement qui est le client. Sans nom, le côté seul.
function speaker(
  author: Author | null | undefined,
  people: Map<string, Person>,
  isNote: boolean,
): Person {
  const side: Side | null = author ? sideOf(author) : isNote ? 'team' : null;
  if (side === null) return { name: null, email: null };
  const known = author?.id ? people.get(`${side}:${author.id}`) : undefined;
  const name = author?.name?.trim() || known?.name;
  const label = SIDE_LABEL[side];
  return {
    name: name ? `${name} (${label})` : label.charAt(0).toUpperCase() + label.slice(1),
    email: author?.email?.trim() || known?.email || null,
  };
}

const toIso = (seconds: number): string => new Date(seconds * 1000).toISOString();

function turn(
  externalId: string,
  author: Person,
  html: string | null | undefined,
  at: number,
  prefix = '',
): ConnectorTurn | null {
  const text = htmlToText(html ?? '').trim();
  if (text === '') return null;
  return { externalId, role: 'participant', author, text: prefix + text, ts: toIso(at) };
}

function isTurn(value: ConnectorTurn | null): value is ConnectorTurn {
  return value !== null;
}

function titleOf(conversation: Conversation): string {
  const title = conversation.title?.trim() || conversation.source?.subject?.trim();
  return title || `Conversation Intercom #${conversation.id}`;
}

function messageParts(detail: Conversation | null): Part[] {
  const parts = detail?.conversation_parts?.conversation_parts ?? [];
  return parts
    .filter(
      (part) => !part.redacted && (part.part_type === 'comment' || NOTE_TYPES.has(part.part_type)),
    )
    .sort((a, b) => a.created_at - b.created_at);
}

// `detail` est nul quand le détail n'a pas pu être lu : la conversation sort avec son premier message.
export function toItem(conversation: Conversation, detail: Conversation | null): ConnectorItem {
  const people = directoryOf(conversation, detail);
  const source = conversation.source;
  const first = source?.redacted
    ? null
    : turn('source', speaker(source?.author, people, false), source?.body, conversation.created_at);
  const replies = messageParts(detail).map((part) => {
    const isNote = NOTE_TYPES.has(part.part_type);
    const author = speaker(part.author, people, isNote);
    return turn(`part:${part.id}`, author, part.body, part.created_at, isNote ? NOTE_PREFIX : '');
  });
  const team = conversation.team_assignee_id;
  return {
    externalId: `conversation:${conversation.id}`,
    nature: 'fil',
    title: titleOf(conversation),
    url: null, // Intercom ne donne pas de lien vers la boîte de réception
    updatedAt: toIso(conversation.updated_at),
    origin: {
      ...(source?.type ? { channel: source.type } : {}),
      ...(team && team !== '0' ? { team } : {}),
    },
    turns: [first, ...replies].filter(isTurn),
  };
}
