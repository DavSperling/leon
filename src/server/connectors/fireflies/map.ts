import { mergeSpeakerTurns } from '../normalize';
import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Transcript } from './client';

// De la fiche d'une réunion Fireflies à un élément du socle.

const OFFSET_MAX_SECONDS = 86_400; // au-delà, la valeur n'est pas une heure de réunion

// Fireflies prépare encore le résumé : la transcription peut être incomplète.
export function isReady(transcript: Transcript): boolean {
  return transcript.meeting_info?.summary_status !== 'processing';
}

function offsetMs(start: number | string | null | undefined): number {
  const seconds = typeof start === 'string' ? Number(start) : start;
  const valid = typeof seconds === 'number' && seconds >= 0 && seconds <= OFFSET_MAX_SECONDS;
  return valid ? Math.round(seconds * 1000) : 0;
}

// Noms de la réunion : invités, puis e-mails d'invités sans fiche, puis locuteurs.
function participantNames(transcript: Transcript, speakers: Array<string | null>): string {
  const names = new Map<string, string>();
  const add = (value: string | null | undefined) => {
    const name = value?.trim();
    if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
  };
  const attendees = transcript.meeting_attendees;
  for (const one of attendees) add(one.displayName ?? one.name ?? one.email);
  const known = new Set(attendees.map((one) => one.email?.toLowerCase()));
  for (const email of transcript.participants) {
    if (!known.has(email.toLowerCase())) add(email);
  }
  for (const speaker of speakers) add(speaker);
  return [...names.values()].join(', ');
}

function spokenTurns(transcript: Transcript, startedAt: number): ConnectorTurn[] {
  const emails = new Map<string, string>();
  for (const one of transcript.meeting_attendees) {
    for (const name of [one.displayName, one.name]) {
      if (name && one.email) emails.set(name.trim().toLowerCase(), one.email);
    }
  }
  return transcript.sentences.flatMap((sentence, position) => {
    const body = sentence.text?.trim();
    if (!body) return [];
    const name = sentence.speaker_name?.trim() || null;
    return [
      {
        externalId: `utterance:${sentence.index ?? position}`,
        role: 'participant' as const,
        author: { name, email: (name && emails.get(name.toLowerCase())) || null },
        text: body,
        ts: new Date(startedAt + offsetMs(sentence.start_time)).toISOString(),
      },
    ];
  });
}

// Sans transcription, le résumé de l'outil tient lieu de texte.
function summaryTurns(transcript: Transcript, startedAt: string): ConnectorTurn[] {
  const summary = transcript.summary;
  const gist = [summary?.overview, summary?.short_summary, summary?.gist]
    .map((value) => value?.trim())
    .find(Boolean);
  const actions = summary?.action_items?.trim();
  const parts = [gist, actions ? `Actions à mener :\n${actions}` : null].filter(Boolean);
  if (parts.length === 0) return [];
  return [
    {
      externalId: 'summary',
      role: 'document',
      author: { name: null, email: transcript.organizer_email ?? null },
      text: parts.join('\n\n'),
      ts: startedAt,
    },
  ];
}

// startedAt : début de la réunion, en millisecondes depuis 1970 (le champ `date` de Fireflies).
// Fireflies ne donne pas de date de modification : la date de l'élément est celle du début.
export function toItem(id: string, startedAt: number, transcript: Transcript): ConnectorItem {
  const updatedAt = new Date(startedAt).toISOString();
  const spoken = spokenTurns(transcript, startedAt);
  const speakers = spoken.map((turn) => turn.author.name);
  const participants = participantNames(transcript, speakers);
  return {
    externalId: `transcript:${id}`,
    nature: 'reunion',
    title: transcript.title?.trim() || 'Réunion Fireflies',
    url: transcript.transcript_url ?? null,
    updatedAt,
    origin: participants ? { participants } : {},
    turns: spoken.length > 0 ? mergeSpeakerTurns(spoken) : summaryTurns(transcript, updatedAt),
  };
}
