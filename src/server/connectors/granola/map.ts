import { mergeSpeakerTurns } from '../normalize';
import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Note, Utterance } from './client';

// Une note Granola devient une réunion : une prise de parole par locuteur, datée de son début.

type Author = ConnectorTurn['author'];

const OTHERS = 'Autres participants'; // sur ordinateur, tout ce qui vient de l'autre côté du son
const UNTITLED = 'Réunion sans titre';

const author = (person: { name?: string | null; email?: string | null }): Author => ({
  name: person.name?.trim() || null,
  email: person.email?.trim() || null,
});

// Granola nomme parfois le locuteur ; sinon « me » est le propriétaire de la note et « them » les
// autres participants. Avec un seul autre participant, on sait qui c'est. Sans rien de tout cela
// (téléphone sans étiquette), l'auteur reste inconnu plutôt qu'inventé.
function authorOf(speaker: Utterance['speaker'], note: Note): Author {
  const owner = author(note.owner ?? {});
  const attendees = (note.attendees ?? []).map(author);
  if (speaker.name) {
    const wanted = speaker.name.trim().toLowerCase();
    const known = [owner, ...attendees].find((person) => person.name?.toLowerCase() === wanted);
    return known ?? { name: speaker.name.trim(), email: null };
  }
  if (speaker.diarization_label) return { name: speaker.diarization_label, email: null };
  if (speaker.attribution === 'me') return owner;
  if (speaker.attribution !== 'them') return { name: null, email: null };
  const others = attendees.filter((person) => person.email !== owner.email);
  return others.length === 1 && others[0] ? others[0] : { name: OTHERS, email: null };
}

function summaryTurn(note: Note): ConnectorTurn[] {
  const text = note.summary_markdown?.trim() || note.summary_text?.trim();
  if (!text) return [];
  return [
    {
      externalId: 'summary',
      role: 'document',
      author: author(note.owner ?? {}),
      text,
      ts: note.updated_at,
    },
  ];
}

// null si la note n'a ni transcription ni résumé.
export function mapNote(note: Note, transcript: Utterance[]): ConnectorItem | null {
  const spoken: ConnectorTurn[] = transcript.flatMap((utterance, index) =>
    utterance.text.trim() === ''
      ? []
      : [
          {
            externalId: `utterance:${index}`,
            role: 'participant',
            author: authorOf(utterance.speaker, note),
            text: utterance.text.trim(),
            ts: utterance.start_time,
          },
        ],
  );
  // Le résumé ne sert que sans transcription : il n'ajouterait rien à ce qui a été dit.
  const turns = spoken.length > 0 ? mergeSpeakerTurns(spoken) : summaryTurn(note);
  if (turns.length === 0) return null;
  const participants = (note.attendees ?? [])
    .map((person) => person.name?.trim() || person.email?.trim())
    .filter(Boolean)
    .join(', ');
  return {
    externalId: `meeting:${note.id}`,
    nature: 'reunion',
    title: note.title?.trim() || note.calendar_event?.event_title?.trim() || UNTITLED,
    url: note.web_url ?? null,
    updatedAt: note.updated_at,
    origin: participants === '' ? {} : { participants },
    turns,
  };
}
