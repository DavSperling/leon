import { mergeSpeakerTurns } from '../normalize';
import type { ConnectorItem, ConnectorTurn } from '../types';
import { HOST, type Meeting, type Segment } from './client';

// De la réunion Circleback à l'élément du socle.

const NO_TITLE = 'Réunion sans titre';

function participants(meeting: Meeting): string {
  return meeting.attendees
    .map((attendee) => attendee.name?.trim() || attendee.email?.trim())
    .filter((name): name is string => Boolean(name))
    .join(', ');
}

// La transcription ne donne que le nom du locuteur : l'adresse vient de l'invité du même nom.
function emailsByName(meeting: Meeting): Map<string, string> {
  const emails = new Map<string, string>();
  for (const { name, email } of meeting.attendees) {
    if (name && email) emails.set(name.trim().toLowerCase(), email);
  }
  return emails;
}

// L'API ne donne pas l'heure de début : la date de création de la réunion en tient lieu, et chaque
// prise de parole se date de ses secondes depuis ce début.
function spokenTurns(meeting: Meeting, transcript: Segment[]): ConnectorTurn[] {
  const start = Date.parse(meeting.createdAt);
  const emails = emailsByName(meeting);
  const turns = transcript.flatMap((segment, index): ConnectorTurn[] => {
    const text = segment.text.trim();
    if (text === '') return [];
    const name = segment.speaker?.trim() || null;
    return [
      {
        externalId: `utterance:${index}`,
        role: 'participant',
        author: { name, email: (name && emails.get(name.toLowerCase())) || null },
        text,
        ts: new Date(start + Math.round(segment.timestamp * 1000)).toISOString(),
      },
    ];
  });
  return mergeSpeakerTurns(turns);
}

// Le résumé de l'outil ne sert que sans transcription. Les notes privées ne sont jamais lues : la
// source est visible de toute l'équipe. Une réunion sans aucun texte n'est pas rendue.
export function meetingToItem(meeting: Meeting, transcript: Segment[]): ConnectorItem | null {
  const spoken = spokenTurns(meeting, transcript);
  const notes = meeting.notes?.trim() ?? '';
  const summary: ConnectorTurn[] =
    notes === ''
      ? []
      : [
          {
            externalId: 'notes',
            role: 'document',
            author: { name: null, email: null },
            text: notes,
            ts: meeting.updatedAt,
          },
        ];
  const turns = spoken.length > 0 ? spoken : summary;
  if (turns.length === 0) return null;
  const names = participants(meeting);
  return {
    externalId: `meeting:${meeting.id}`,
    nature: 'reunion',
    title: meeting.name?.trim() || NO_TITLE,
    url: `https://${HOST}/meetings/${encodeURIComponent(meeting.id)}`,
    updatedAt: meeting.updatedAt,
    origin: names === '' ? {} : { participants: names },
    turns,
  };
}
