import { htmlToText, mergeSpeakerTurns } from '../normalize';
import type { Audience, AudienceMember, ConnectorItem, ConnectorTurn } from '../types';
import type { Place } from './daily';
import type { Event, Member, Message, Root, Transcript } from './schemas';

// De la réponse de Graph à des éléments du socle. Chaque message est un tour `participant` daté de son envoi. Un fil
// de canal regroupe un message et ses réponses ; une conversation privée se découpe par jour (UTC), comme Slack.
// Graph ne donne pas l'adresse de l'auteur, seulement son nom.

const iso = (value: string) => new Date(value).toISOString();

// Un membre d'une conversation ou d'un canal, tel que Leon le retrouve dans l'organisation (0097) : son adresse, son
// identifiant Microsoft, et le début de l'historique qu'il voit.
export const memberOf = (member: Member): AudienceMember => ({
  email: member.email ?? null,
  id: member.userId ?? null,
  since: member.visibleHistoryStartDateTime ?? null,
});

// Un identifiant de message n'est unique que dans son canal ou sa conversation : le tour porte les deux, pour que
// `removedTurns` le retrouve dans tout le compte.
export const turnId = (place: string, id: string) => `message:${place}/${id}`;

function textOf(message: Message): string {
  const content = message.body?.content ?? '';
  const text = message.body?.contentType.toLowerCase() === 'html' ? htmlToText(content) : content;
  return text.replaceAll('\r\n', '\n').trim();
}

// Ni message système (arrivée d'un membre, nom changé), ni message supprimé, ni message sans texte.
function turnOf(place: string, message: Message): ConnectorTurn | null {
  if ((message.messageType ?? 'message') !== 'message' || message.deletedDateTime) return null;
  const text = textOf(message);
  if (text === '') return null;
  return {
    externalId: turnId(place, message.id),
    role: 'participant',
    author: { name: message.from?.user?.displayName ?? null, email: null },
    text,
    ts: iso(message.createdDateTime),
  };
}

const chronological = (turns: ConnectorTurn[]) =>
  turns.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

// Les messages supprimés chez Microsoft, à retirer de Leon.
export const deletedTurns = (place: string, messages: Message[]) =>
  messages.filter((message) => message.deletedDateTime).map((m) => turnId(place, m.id));

// Le dernier changement d'un message : envoi, modification ou suppression.
export const changedAt = (message: Message): number =>
  Math.max(
    ...[message.createdDateTime, message.lastModifiedDateTime, message.deletedDateTime].map((at) =>
      at ? Date.parse(at) : 0,
    ),
  );

const firstLine = (text: string) => (text.split('\n')[0] ?? '').slice(0, 120).trim();

export function threadItem(place: Place, root: Root, replies: Message[]): ConnectorItem | null {
  const turns = chronological(
    [root, ...replies].flatMap((message) => turnOf(place.key, message) ?? []),
  );
  const last = turns.at(-1);
  if (!last) return null;
  const opening = root.deletedDateTime ? '' : firstLine(textOf(root));
  return {
    externalId: `thread:${place.key}/${root.id}`,
    nature: 'fil',
    title: root.subject?.trim() || opening || `Fil du canal ${place.name}`,
    url: root.webUrl ?? null,
    updatedAt: last.ts,
    origin: place.origin,
    turns,
    audience: place.key,
  };
}

// Les messages d'une page d'une conversation, regroupés par jour, du jour le moins récent au plus récent.
export function chatDays(place: Place, messages: Message[]): ConnectorItem[] {
  const days = new Map<string, { turn: ConnectorTurn; message: Message }[]>();
  for (const message of messages) {
    const turn = turnOf(place.key, message);
    if (!turn) continue;
    const day = turn.ts.slice(0, 10);
    days.set(day, [...(days.get(day) ?? []), { turn, message }]);
  }
  return [...days]
    .map(([day, entries]): ConnectorItem => {
      const turns = chronological(entries.map((entry) => entry.turn));
      const [year, month, date] = day.split('-');
      return {
        externalId: `chat:${place.key}:${day}`,
        nature: 'fil',
        title: `${place.name}, ${date}/${month}/${year}`,
        url: entries.find((entry) => entry.message.webUrl)?.message.webUrl ?? null,
        updatedAt: turns.at(-1)?.ts ?? `${day}T00:00:00.000Z`,
        origin: place.origin,
        turns,
        audience: place.key,
      };
    })
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
}

// --- Transcriptions de réunion (Teams Chat)

// Une prise de parole WebVTT (calltranscript-get, lue le 27/11/2026) : « 00:00:16.246 --> 00:00:17.726 » puis
// « <v Nom>Texte.</v> ». Les heures peuvent manquer (« 00:16.246 »), comme le permet WebVTT.
const CUE_START = /^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})\s+-->/;
const VOICE = /^<v(?:\.[^\s>]*)?\s+([^>]*)>(.*?)(?:<\/v>)?$/s;

type Person = { name?: string | null; address?: string | null };

const peopleOf = (event: Event): Person[] =>
  [event.organizer, ...(event.attendees ?? [])].flatMap((person) => person?.emailAddress ?? []);

// L'adresse de qui parle se retrouve par son nom, parmi l'organisateur et les invités.
function emailOf(name: string | null, people: Person[]): string | null {
  const wanted = name?.toLowerCase();
  if (!wanted) return null;
  return people.find((p) => p.name?.trim().toLowerCase() === wanted)?.address?.trim() || null;
}

// Une prise de parole par personne qui parle (les phrases qui se suivent sont regroupées), datée du début de la
// transcription plus son décalage. Sans nom (l'administrateur l'a retiré), l'auteur reste vide.
function speeches(vtt: string, startMs: number, people: Person[]): ConnectorTurn[] {
  const turns: ConnectorTurn[] = [];
  for (const block of vtt.replaceAll('\r\n', '\n').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const at = lines.findIndex((line) => CUE_START.test(line));
    const time = CUE_START.exec(lines[at] ?? '');
    if (!time) continue;
    const [, hours = '0', minutes, seconds, ms] = time;
    const cue = lines
      .slice(at + 1)
      .join(' ')
      .trim();
    const voice = VOICE.exec(cue);
    const text = htmlToText(voice ? (voice[2] ?? '') : cue).trim();
    if (text === '') continue;
    const name = voice?.[1]?.trim() || null;
    const offset = ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000;
    turns.push({
      externalId: `speech:${turns.length}`,
      role: 'participant',
      author: { name, email: emailOf(name, people) },
      text,
      ts: new Date(startMs + offset + Number(ms)).toISOString(),
    });
  }
  return mergeSpeakerTurns(turns);
}

// Qui voit une transcription : l'organisateur et les invités de la réunion, par leur adresse (l'agenda n'en dit pas
// plus). Chaque transcription est son propre lieu.
export const transcriptAudience = (event: Event, transcript: Transcript): Audience => ({
  key: `transcript:${transcript.id}`,
  members: peopleOf(event).flatMap((person) =>
    person.address ? [{ email: person.address, id: null }] : [],
  ),
});

// Une transcription devient un élément de nature « reunion », comme celles de Fathom ou tl;dv. Son identifiant est
// unique dans tout Graph. Un texte sans aucune prise de parole datée (format sans nom inconnu) est gardé d'un bloc.
export function transcriptItem(
  event: Event,
  transcript: Transcript,
  content: string,
): ConnectorItem | null {
  const startMs = Date.parse(transcript.createdDateTime);
  const start = new Date(startMs).toISOString();
  const people = peopleOf(event);
  let turns = speeches(content, startMs, people);
  const whole = content.trim();
  if (turns.length === 0 && whole !== '' && !whole.startsWith('WEBVTT')) {
    const author = { name: null, email: null };
    turns = [{ externalId: 'texte', role: 'participant', author, text: whole, ts: start }];
  }
  if (turns.length === 0) return null;
  const names = [...new Set(people.flatMap((p) => p.name?.trim() || []))];
  return {
    externalId: `transcript:${transcript.id}`,
    nature: 'reunion',
    title: event.subject?.trim() || 'Réunion Teams',
    url: event.webLink ?? null,
    updatedAt: new Date(Date.parse(transcript.endDateTime ?? start)).toISOString(),
    origin: names.length > 0 ? { participants: names.join(', ') } : {},
    turns,
    audience: `transcript:${transcript.id}`,
  };
}
