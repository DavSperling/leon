import { mergeSpeakerTurns } from '../normalize';
import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Meeting } from './client';

// HH:MM:SS depuis le début de la réunion, en secondes (0 si le format change).
function offsetSeconds(timestamp: string): number {
  if (!/^\d+:\d{2}:\d{2}$/.test(timestamp.trim())) return 0;
  const [hours = 0, minutes = 0, seconds = 0] = timestamp.trim().split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

// Les prises de parole sont datées depuis le début de l'enregistrement : la doc dit « depuis le
// début de la réunion » sans préciser lequel. L'écart est de quelques minutes au plus.
function speechTurns(meeting: Meeting): ConnectorTurn[] {
  const start = Date.parse(meeting.recording_start_time);
  const turns = (meeting.transcript ?? []).map(
    (speech, index): ConnectorTurn => ({
      externalId: `utterance:${index}`,
      role: 'participant',
      author: {
        name: speech.speaker.display_name,
        email: speech.speaker.matched_calendar_invitee_email ?? null,
      },
      text: speech.text.trim(),
      ts: new Date(start + offsetSeconds(speech.timestamp) * 1000).toISOString(),
    }),
  );
  return mergeSpeakerTurns(turns.filter((turn) => turn.text !== ''));
}

function summaryTurns(meeting: Meeting, updatedAt: string): ConnectorTurn[] {
  const text = meeting.default_summary?.markdown_formatted?.trim();
  if (!text) return [];
  const by = meeting.recorded_by;
  const author = { name: by?.name ?? null, email: by?.email ?? null };
  return [{ externalId: 'summary', role: 'document', author, text, ts: updatedAt }];
}

// Les invités du calendrier, à défaut ceux qui ont parlé.
function participants(meeting: Meeting, turns: ConnectorTurn[]): string {
  const invited = (meeting.calendar_invitees ?? []).map((p) => p.name?.trim() || p.email || '');
  const speakers = turns.flatMap((turn) => (turn.author.name ? [turn.author.name] : []));
  const names = invited.some(Boolean) ? invited : speakers;
  return [...new Set(names.filter(Boolean))].join(', ');
}

// null quand Fathom n'a ni transcription ni résumé (réunion pas encore traitée, ou sans texte).
export function toItem(meeting: Meeting): ConnectorItem | null {
  const updatedAt = new Date(meeting.created_at).toISOString();
  const speech = speechTurns(meeting);
  const turns = speech.length > 0 ? speech : summaryTurns(meeting, updatedAt);
  if (turns.length === 0) return null;
  const names = participants(meeting, turns);
  return {
    externalId: `meeting:${meeting.recording_id}`,
    nature: 'reunion',
    title: meeting.title.trim() || 'Réunion sans titre',
    url: meeting.url ?? null,
    updatedAt,
    origin: names === '' ? {} : { participants: names },
    turns,
  };
}
