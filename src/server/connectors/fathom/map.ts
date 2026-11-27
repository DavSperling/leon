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

type ActionItem = NonNullable<Meeting['action_items']>[number];

// « - À faire : Prévenir le client (Paul Martin, paul@acme.test, à 00:01:02) » : où en est l'action, ce qu'elle dit,
// à qui Fathom la confie et quand elle a été dite.
function actionLine(action: ActionItem): string {
  const assignee = [action.assignee?.name, action.assignee?.email].map((part) => part?.trim());
  const at = action.recording_timestamp ? `à ${action.recording_timestamp}` : '';
  const details = [...assignee, at].filter(Boolean).join(', ');
  const state = action.completed ? 'Faite' : 'À faire';
  return `- ${state} : ${action.description.trim()}${details ? ` (${details})` : ''}`;
}

// Le résumé de Fathom et ses actions à mener, en un tour document, avec ou sans transcription.
function summaryTurns(meeting: Meeting, updatedAt: string): ConnectorTurn[] {
  const summary = meeting.default_summary?.markdown_formatted?.trim();
  const actions = (meeting.action_items ?? [])
    .filter((action) => action.description.trim() !== '')
    .map(actionLine);
  const list = actions.length > 0 ? `Actions à mener :\n${actions.join('\n')}` : '';
  const text = [summary, list].filter(Boolean).join('\n\n');
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

// null quand Fathom n'a ni transcription, ni résumé, ni action (réunion pas encore traitée, ou sans texte).
export function toItem(meeting: Meeting): ConnectorItem | null {
  const updatedAt = new Date(meeting.created_at).toISOString();
  const speech = speechTurns(meeting);
  const turns = [...speech, ...summaryTurns(meeting, updatedAt)];
  if (turns.length === 0) return null;
  // Sans transcription, l'auteur du résumé tient lieu de locuteur.
  const names = participants(meeting, speech.length > 0 ? speech : turns);
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
