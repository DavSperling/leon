import { htmlToText } from '../normalize';
import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Comment, Message, Teammate } from './client';

// De la réponse de Front à un élément du socle : une conversation est un fil. Chaque message et
// chaque note interne est un tour `participant` signé et daté (il n'y a pas de corps à part, donc
// pas de tour `document`). Une note interne, que le client ne voit pas, est marquée par l'attribut
// `internalNote` du tour, pas dans son texte. Le côté vient de Front, pas du nom : un message écrit
// par un équipier a un `author`, un message reçu (`is_inbound`) n'en a pas et son expéditeur est
// extérieur, quel que soit le nom que porte son en-tête « From ».

type Person = ConnectorTurn['author'];
type Marks = Pick<ConnectorTurn, 'side' | 'internalNote'>;
const NOBODY: Person = { name: null, email: null };
const OPEN_URL = 'https://app.frontapp.com/open';

const iso = (seconds: number): string => new Date(Math.round(seconds * 1000)).toISOString();

function teammate(person: Teammate): Person {
  const name = [person.first_name, person.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  return { name: name || person.username || null, email: person.email || null };
}

// Un message reçu n'a pas d'auteur : l'expéditeur est le destinataire de rôle « from ». Son
// identifiant (adresse, numéro de téléphone…) tient lieu de nom quand Front n'en donne pas.
function senderOf(message: Message): Person {
  if (message.author) return teammate(message.author);
  const from = message.recipients?.find((recipient) => recipient.role === 'from');
  if (!from) return NOBODY;
  return {
    name: from.name?.trim() || from.handle,
    email: from.handle.includes('@') ? from.handle : null,
  };
}

// La version texte quand Front la donne (e-mails), sinon le corps, qui est du HTML.
const messageText = (message: Message): string =>
  message.text?.trim() || htmlToText(message.body ?? '');

function sideOf(message: Message): ConnectorTurn['side'] {
  if (message.author) return 'team';
  return message.is_inbound ? 'external' : undefined;
}

function turn(
  externalId: string,
  author: Person,
  text: string,
  seconds: number,
  marks: Marks,
): ConnectorTurn | null {
  return text.trim() === ''
    ? null
    : { externalId, role: 'participant', author, ...marks, text, ts: iso(seconds) };
}

const isTurn = (value: ConnectorTurn | null): value is ConnectorTurn => value !== null;

// Une conversation sans aucun texte n'est pas rendue. Les brouillons ne sont pas envoyés : ils sont
// laissés de côté.
export function toItem(
  id: string,
  subject: string | null | undefined,
  messages: Message[],
  comments: Comment[],
): ConnectorItem | null {
  const turns = [
    ...messages
      .filter((message) => !message.draft_mode)
      .map((message) =>
        turn(`message:${message.id}`, senderOf(message), messageText(message), message.created_at, {
          side: sideOf(message),
          internalNote: false,
        }),
      ),
    ...comments.map((comment) => {
      const author = comment.author ? teammate(comment.author) : NOBODY;
      const marks: Marks = { side: comment.author ? 'team' : undefined, internalNote: true };
      return turn(
        `comment:${comment.id}`,
        author,
        comment.body?.trim() ?? '',
        comment.posted_at,
        marks,
      );
    }),
  ]
    .filter(isTurn)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const last = turns.at(-1);
  if (!last) return null;
  return {
    externalId: `conversation:${id}`,
    nature: 'fil',
    title: subject?.trim() || 'Conversation sans objet',
    url: `${OPEN_URL}/${id}`,
    updatedAt: last.ts,
    origin: {},
    turns,
  };
}
