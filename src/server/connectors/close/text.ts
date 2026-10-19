import type { Activity, Transcript } from './client';

// Le texte d'une activité de Close, tel que le liront la recherche et les assistants : une première ligne qui dit de
// quoi il s'agit et dans quel sens (reçu ou envoyé), puis le contenu.

export type Direction = 'received' | 'sent' | null;

const RECEIVED = ['incoming', 'inbound'];
const SENT = ['outgoing', 'outbound'];

export function directionOf(activity: Activity): Direction {
  const direction = activity.direction?.toLowerCase() ?? '';
  if (RECEIVED.includes(direction)) return 'received';
  return SENT.includes(direction) ? 'sent' : null;
}

// [reçu, envoyé, sens inconnu]. Une note n'a pas de première ligne.
const HEADLINES: Record<string, [string, string, string]> = {
  Call: ['Appel entrant', 'Appel sortant', 'Appel'],
  Email: ['E-mail reçu', 'E-mail envoyé', 'E-mail'],
  SMS: ['SMS reçu', 'SMS envoyé', 'SMS'],
  WhatsAppMessage: ['Message WhatsApp reçu', 'Message WhatsApp envoyé', 'Message WhatsApp'],
};

const joinParts = (separator: string, parts: Array<string | null | undefined>) =>
  parts.filter((part): part is string => Boolean(part)).join(separator);

function durationOf(seconds: number | null | undefined): string | null {
  if (!seconds || seconds < 0) return null;
  return seconds < 60 ? `${Math.round(seconds)} s` : `${Math.round(seconds / 60)} min`;
}

function headlineOf(activity: Activity): string | null {
  const words = HEADLINES[activity._type];
  if (!words) return null;
  const direction = directionOf(activity);
  const base = direction === 'received' ? words[0] : direction === 'sent' ? words[1] : words[2];
  const duration = activity._type === 'Call' ? durationOf(activity.duration) : null;
  return duration ? `${base} (${duration})` : base;
}

// Les prises de parole consécutives d'un même locuteur forment une seule ligne.
function transcriptBlock(title: string, transcript: Transcript | undefined): string | null {
  const lines: string[] = [];
  let last: string | null = null;
  for (const utterance of transcript?.utterances ?? []) {
    const said = utterance.text?.trim();
    if (!said) continue;
    const fallback = utterance.speaker_side === 'close-user' ? 'Équipe' : 'Contact';
    const speaker = utterance.speaker_label?.trim() || fallback;
    if (speaker === last) lines[lines.length - 1] += ` ${said}`;
    else lines.push(`${speaker} : ${said}`);
    last = speaker;
  }
  return lines.length > 0 ? `${title} :\n${lines.join('\n')}` : null;
}

function callBody(activity: Activity): string {
  const summary = activity.recording_transcript?.summary_text?.trim();
  return joinParts('\n\n', [
    activity.note?.trim(),
    summary ? `Résumé : ${summary}` : null,
    transcriptBlock('Transcription', activity.recording_transcript),
    transcriptBlock('Message vocal', activity.voicemail_transcript),
  ]);
}

function bodyOf(activity: Activity): string {
  switch (activity._type) {
    case 'Note':
      return activity.note?.trim() ?? '';
    case 'Call':
      return callBody(activity);
    case 'Email': {
      const subject = activity.subject?.trim();
      return joinParts('\n\n', [subject ? `Objet : ${subject}` : null, activity.body_text?.trim()]);
    }
    default: // SMS et messages WhatsApp
      return activity.text?.trim() ?? '';
  }
}

// Null quand l'activité n'a aucun texte : un appel sans note ni transcription n'apprend rien.
export function textOf(activity: Activity): string | null {
  const body = bodyOf(activity);
  if (!body) return null;
  return joinParts('\n', [headlineOf(activity), body]);
}
