import { htmlToText } from '../normalize';
import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Folder } from './client';
import type { GraphEvent, Message } from './schemas';

// De la réponse de Graph à des éléments du socle. Un fil de courrier regroupe les messages d'une
// même conversation lus ensemble : chaque message est un tour `participant` daté de sa réception
// (ou de son envoi). Un événement d'agenda est une réunion, avec un seul tour `document` : ses
// détails et sa description. Le côté vient du dossier : un message des éléments envoyés est celui du
// propriétaire de la boîte ; rien n'est déduit pour la boîte de réception.

const iso = (value: string) => new Date(value).toISOString();

function textOf(body: Message['body']): string {
  const content = body?.content ?? '';
  const text = body?.contentType.toLowerCase() === 'html' ? htmlToText(content) : content;
  return text.replaceAll('\r\n', '\n').trim();
}

// « RE : », « TR : », « FW : »… changent à chaque réponse : le titre du fil ne doit pas suivre.
const REPLY_PREFIX = /^(?:(?:re|tr|fw|fwd|rv|aw)\s*:\s*)+/i;
const titleOf = (subject: string | null | undefined): string =>
  (subject ?? '').replace(REPLY_PREFIX, '').trim() || 'Sans objet';

function messageTurn(message: Message, folder: Folder): ConnectorTurn | null {
  const text = textOf(message.body);
  if (text === '') return null;
  const from = message.from?.emailAddress;
  return {
    externalId: `message:${message.id}`,
    role: 'participant',
    author: { name: from?.name ?? null, email: from?.address ?? null },
    ...(folder === 'sentitems' ? { side: 'team' as const } : {}),
    text,
    ts: iso(message.receivedDateTime),
  };
}

type Entry = { message: Message; turn: ConnectorTurn };

function threadItem(id: string, entries: Entry[]): ConnectorItem[] {
  const first = entries[0];
  const last = entries.at(-1);
  if (!first || !last) return [];
  return [
    {
      externalId: `thread:${id}`,
      nature: 'fil',
      title: titleOf(first.message.subject),
      url: last.message.webLink ?? null,
      updatedAt: last.turn.ts,
      origin: {},
      turns: entries.map((entry) => entry.turn),
    },
  ];
}

// Les messages d'une page, regroupés par conversation, du fil le moins récemment animé au plus récent.
// Un message sans texte n'est pas rendu.
export function threadsOf(messages: Message[], folder: Folder): ConnectorItem[] {
  const threads = new Map<string, Entry[]>();
  for (const message of messages) {
    const turn = messageTurn(message, folder);
    if (!turn) continue;
    const id = message.conversationId ?? message.id;
    threads.set(id, [...(threads.get(id) ?? []), { message, turn }]);
  }
  return [...threads]
    .flatMap(([id, entries]) => threadItem(id, entries))
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
}

// L'heure est en UTC (Graph la rend ainsi sans en-tête de fuseau) ; un autre fuseau garde son nom.
function when(time: NonNullable<GraphEvent['start']>): string {
  const local = time.dateTime.slice(0, 19);
  return time.timeZone === 'UTC' ? `${local}Z` : `${local} (${time.timeZone})`;
}

const nameOf = (person: { name?: string | null; address?: string | null } | undefined) =>
  person?.name || person?.address || '';

// Rien pour un événement privé (l'équipe n'a pas à le voir), ni pour un événement sans participant
// ni description (« Déjeuner » : l'objet seul ne dit rien).
export function eventToItem(event: GraphEvent): ConnectorItem | null {
  if (event.sensitivity === 'private') return null;
  const people = (event.attendees ?? []).map((a) => nameOf(a.emailAddress)).filter(Boolean);
  const description = textOf(event.body);
  if (people.length === 0 && description === '') return null;
  const organizer = event.organizer?.emailAddress;
  const details = [
    event.start && `Début : ${when(event.start)}`,
    event.end && `Fin : ${when(event.end)}`,
    event.location?.displayName && `Lieu : ${event.location.displayName}`,
    nameOf(organizer) && `Organisateur : ${nameOf(organizer)}`,
    people.length > 0 && `Participants : ${people.join(', ')}`,
    event.isCancelled && 'Statut : annulée',
  ].filter((line): line is string => typeof line === 'string' && line !== '');
  const updatedAt = iso(event.lastModifiedDateTime);
  return {
    externalId: `event:${event.id}`,
    nature: 'reunion',
    title: event.subject?.trim() || 'Sans objet',
    url: event.webLink ?? null,
    updatedAt,
    origin: people.length > 0 ? { participants: people.join(', ') } : {},
    turns: [
      {
        externalId: 'body',
        role: 'document',
        author: { name: organizer?.name ?? null, email: organizer?.address ?? null },
        ...(event.isOrganizer ? { side: 'team' as const } : {}),
        text: [details.join('\n'), description].filter(Boolean).join('\n\n'),
        ts: updatedAt,
      },
    ],
  };
}
