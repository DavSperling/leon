import { mergeSpeakerTurns } from '../normalize';
import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Meeting, Person, Segment } from './client';

// Une réunion de tl;dv devient un élément de nature « reunion » : une prise de parole par locuteur
// (les phrases qui se suivent sont regroupées), ou à défaut le résumé de l'outil.

// Le début de la parole est un décalage en secondes depuis le début de la réunion (la doc ne
// donne pas l'unité ; ses exemples, 0 puis 5 pour une réunion de 1 800, sont des secondes).
const OFFSET_MAX_SECONDS = 7 * 86_400;

type Content = { segments: Segment[]; notes: string };

function people(meeting: Meeting): Person[] {
  return [meeting.organizer, ...(meeting.invitees ?? [])].filter((p) => p != null);
}

// L'adresse d'un locuteur se retrouve par son nom, parmi l'organisateur et les invités.
function emailOf(name: string | null, attendees: Person[]): string | null {
  if (name === null) return null;
  const found = attendees.find((p) => p.name?.trim().toLowerCase() === name.toLowerCase());
  return found?.email?.trim() || null;
}

function speechTurns(startMs: number, segments: Segment[], attendees: Person[]): ConnectorTurn[] {
  const turns = segments.flatMap((segment, index): ConnectorTurn[] => {
    const text = segment.text.trim();
    if (text === '') return [];
    const name = segment.speaker?.trim() || null;
    const offset = Math.min(Math.max(segment.startTime, 0), OFFSET_MAX_SECONDS);
    return [
      {
        externalId: `speech:${index}`,
        role: 'participant',
        author: { name, email: emailOf(name, attendees) },
        text,
        ts: new Date(startMs + Math.round(offset * 1000)).toISOString(),
      },
    ];
  });
  return mergeSpeakerTurns(turns);
}

// null si la réunion n'a ni transcription ni résumé : il n'y a rien à retenir.
export function toItem(meeting: Meeting, content: Content): ConnectorItem | null {
  const startMs = Date.parse(meeting.happenedAt);
  const startIso = new Date(startMs).toISOString();
  const attendees = people(meeting);
  let turns = speechTurns(startMs, content.segments, attendees);
  const notes = content.notes.trim();
  if (turns.length === 0 && notes !== '') {
    const organizer = meeting.organizer;
    turns = [
      {
        externalId: 'notes',
        role: 'document',
        author: { name: organizer?.name?.trim() || null, email: organizer?.email?.trim() || null },
        text: notes,
        ts: startIso,
      },
    ];
  }
  if (turns.length === 0) return null;
  const names = [...new Set(attendees.map((p) => p.name?.trim()).filter((n): n is string => !!n))];
  return {
    externalId: `meeting:${meeting.id}`,
    nature: 'reunion',
    title: meeting.name?.trim() || 'Réunion sans titre',
    url: meeting.url?.trim() || null,
    updatedAt: startIso, // l'outil ne donne pas de date de modification : celle de la réunion
    origin: names.length > 0 ? { participants: names.join(', ') } : {},
    turns,
  };
}
