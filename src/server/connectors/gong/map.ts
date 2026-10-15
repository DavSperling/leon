import { mergeSpeakerTurns } from '../normalize';
import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Call, Monologue } from './client';

type Speaker = { name: string; email: string | null };

// Qui parle : la liste des participants rapproche un speakerId d'un nom et d'une adresse. Un
// locuteur absent de la liste garde un libellé stable dans l'appel (« Locuteur 1 »).
function speakerOf(call: Call): (speakerId: string | null | undefined) => Speaker {
  const known = new Map<string, Speaker>();
  for (const party of call.parties ?? []) {
    const email = party.emailAddress?.trim() || null;
    const name = party.name?.trim() || email;
    if (party.speakerId && name && !known.has(party.speakerId)) {
      known.set(party.speakerId, { name, email });
    }
  }
  let unknown = 0;
  return (speakerId) => {
    const key = speakerId ?? '';
    let speaker = known.get(key);
    if (!speaker) {
      unknown += 1;
      speaker = { name: `Locuteur ${unknown}`, email: null };
      known.set(key, speaker);
    }
    return speaker;
  };
}

// Une prise de parole par monologue, dans l'ordre du temps, datée depuis le début de l'appel.
function speechTurns(call: Call, monologues: Monologue[]): ConnectorTurn[] {
  const start = Date.parse(call.metaData.started);
  const talks = monologues.flatMap((monologue, index) => {
    const sentences = (monologue.sentences ?? []).filter((sentence) => sentence.text.trim() !== '');
    const offset = sentences[0]?.start;
    if (offset === undefined) return [];
    const text = sentences.map((sentence) => sentence.text.trim()).join(' ');
    return [{ index, speakerId: monologue.speakerId, offset, text }];
  });
  talks.sort((a, b) => a.offset - b.offset);
  const speakerFor = speakerOf(call);
  const turns = talks.map(({ index, speakerId, offset, text }): ConnectorTurn => {
    const { name, email } = speakerFor(speakerId);
    return {
      externalId: `utterance:${index}`,
      role: 'participant',
      author: { name, email },
      text,
      ts: new Date(start + offset).toISOString(),
    };
  });
  return mergeSpeakerTurns(turns);
}

function summaryTurns(call: Call, updatedAt: string): ConnectorTurn[] {
  const text = call.content?.brief?.trim();
  if (!text) return [];
  return [
    {
      externalId: 'summary',
      role: 'document',
      author: { name: null, email: null },
      text,
      ts: updatedAt,
    },
  ];
}

// Les participants de la liste, à défaut ceux qui ont parlé.
function participants(call: Call, turns: ConnectorTurn[]): string {
  const listed = (call.parties ?? []).map((p) => p.name?.trim() || p.emailAddress?.trim() || '');
  const speakers = turns.flatMap((turn) => (turn.author.name ? [turn.author.name] : []));
  const names = listed.some(Boolean) ? listed : speakers;
  return [...new Set(names.filter(Boolean))].join(', ');
}

// Le résumé de Gong ne sert que sans transcription. null quand l'appel n'a ni l'un ni l'autre.
export function toItem(call: Call, monologues: Monologue[]): ConnectorItem | null {
  const { metaData } = call;
  const updatedAt = new Date(metaData.started).toISOString();
  const speech = speechTurns(call, monologues);
  const turns = speech.length > 0 ? speech : summaryTurns(call, updatedAt);
  if (turns.length === 0) return null;
  const names = participants(call, turns);
  return {
    externalId: `call:${metaData.id}`,
    nature: 'reunion',
    title: metaData.title?.trim() || 'Réunion sans titre',
    url: metaData.url ?? null,
    updatedAt,
    origin: names === '' ? {} : { participants: names },
    turns,
  };
}

export function hasSpeech(item: ConnectorItem | null): boolean {
  return item?.turns.some((turn) => turn.role === 'participant') ?? false;
}
