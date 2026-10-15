import { mergeSpeakerTurns } from '../normalize';
import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Recording, Segment } from './client';

// De l'enregistrement et de la transcription de Claap à un élément du socle.

type Author = { name: string | null; email: string | null };

const OFFSET_MAX_SECONDS = 86_400; // au-delà, la valeur n'est pas une heure de réunion

function offsetMs(seconds: number): number {
  return seconds >= 0 && seconds <= OFFSET_MAX_SECONDS ? Math.round(seconds * 1000) : 0;
}

function author(person: { name?: string | null; email?: string | null }): Author {
  return { name: person.name?.trim() || null, email: person.email?.trim() || null };
}

// Les personnes à qui attribuer la parole d'un locuteur unique : les participants présents, à
// défaut (capture sans réunion) celui qui a enregistré.
function candidates(recording: Recording): Author[] {
  const present = (recording.meeting?.participants ?? []).filter((one) => one.attended);
  if (present.length > 0) return present.map(author);
  return recording.recorder ? [author(recording.recorder)] : [];
}

// Claap ne nomme pas les locuteurs : « speaker_1 », « speaker_2 ». Le libellé est gardé, sauf
// quand une seule voix parle et qu'une seule personne était là : c'est elle.
function authorOf(segment: Segment, sole: Author | null): Author {
  if (sole) return sole;
  return { name: segment.speaker?.trim() || null, email: null };
}

function spokenTurns(recording: Recording, segments: Segment[]): ConnectorTurn[] {
  // La réunion a commencé à l'heure prévue ; sans réunion, l'enregistrement part de sa création.
  const start = Date.parse(recording.meeting?.startingAt ?? recording.createdAt);
  const voices = new Set(segments.map((segment) => segment.speaker ?? ''));
  const people = candidates(recording);
  const sole = voices.size <= 1 && people.length === 1 ? (people[0] ?? null) : null;
  return segments.flatMap((segment, position) => {
    const text = segment.text.trim();
    if (text === '') return [];
    return [
      {
        externalId: `utterance:${position}`,
        role: 'participant' as const,
        author: authorOf(segment, sole),
        text,
        ts: new Date(start + offsetMs(segment.startedAt)).toISOString(),
      },
    ];
  });
}

// Les invités (présents ou non), à défaut celui qui a enregistré.
function participantNames(recording: Recording): string {
  const invited = recording.meeting?.participants ?? [];
  const people = invited.length > 0 ? invited : recording.recorder ? [recording.recorder] : [];
  const names = people.map((one) => one.name?.trim() || one.email?.trim() || '');
  return [...new Set(names.filter(Boolean))].join(', ');
}

// null quand la transcription ne contient aucune parole. Claap n'a pas de date de modification :
// la date de l'élément est celle de la création.
export function toItem(recording: Recording, segments: Segment[]): ConnectorItem | null {
  const turns = mergeSpeakerTurns(spokenTurns(recording, segments));
  if (turns.length === 0) return null;
  const names = participantNames(recording);
  return {
    externalId: `recording:${recording.id}`,
    nature: 'reunion',
    title: recording.title?.trim() || 'Enregistrement sans titre',
    url: recording.url ?? null,
    updatedAt: new Date(recording.createdAt).toISOString(),
    origin: names === '' ? {} : { participants: names },
    turns,
  };
}
