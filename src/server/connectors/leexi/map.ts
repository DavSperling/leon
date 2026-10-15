import { mergeSpeakerTurns } from '../normalize';
import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Call } from './client';

// De l'appel ou de la réunion Leexi à l'élément du socle.

const NO_TITLE = 'Appel ou réunion sans titre';

// Une prise de parole commence par « Nom (00:00 - 00:10) » : minutes et secondes, ou heures,
// minutes et secondes (la doc ne montre que la première écriture). Le nom peut lui-même contenir
// des parenthèses : seule la fin de la ligne compte.
const CLOCK = '\\d{1,4}(?::\\d{2}){1,2}';
const HEADER = new RegExp(`^(.+) \\((${CLOCK}) - ${CLOCK}\\)$`);

function seconds(clock: string): number {
  return clock.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

type Paragraph = { speaker: string | null; start: number; lines: string[] };

// Le texte avant le premier en-tête (ou tout le texte, s'il n'y en a aucun) est une prise de
// parole sans nom.
function paragraphs(transcript: string): Paragraph[] {
  const found: Paragraph[] = [];
  for (const line of transcript.split(/\r?\n/)) {
    const header = HEADER.exec(line.trim());
    if (header) {
      found.push({
        speaker: (header[1] ?? '').trim() || null,
        start: seconds(header[2] ?? ''),
        lines: [],
      });
    } else if (found.length > 0 || line.trim() !== '') {
      if (found.length === 0) found.push({ speaker: null, start: 0, lines: [] });
      found.at(-1)?.lines.push(line);
    }
  }
  return found;
}

type Person = { name?: string | null; email?: string | null };

// Invités de l'équipe, clients, puis locuteurs : dans cet ordre, le premier nom vu est gardé.
function people(call: Call): Person[] {
  const speakers = call.speakers.map(({ name, email_address }) => ({ name, email: email_address }));
  return [...call.participating_users, ...call.customers, ...speakers];
}

// La transcription ne donne que le nom du locuteur : l'adresse vient de la personne du même nom.
function emailsByName(call: Call): Map<string, string> {
  const emails = new Map<string, string>();
  for (const { name, email } of people(call)) {
    const key = name?.trim().toLowerCase();
    if (key && email?.trim() && !emails.has(key)) emails.set(key, email.trim());
  }
  return emails;
}

// Noms de l'appel : invités, clients, locuteurs déclarés, puis ceux qui ont parlé sans être déclarés.
function participantNames(call: Call, spoken: ConnectorTurn[]): string {
  const names = new Map<string, string>();
  const talkers = spoken.map((turn) => ({ name: turn.author.name, email: null }));
  for (const { name, email } of [...people(call), ...talkers]) {
    const label = name?.trim() || email?.trim();
    if (label && !names.has(label.toLowerCase())) names.set(label.toLowerCase(), label);
  }
  return [...names.values()].join(', ');
}

// Chaque prise de parole se date du début de l'appel plus son horodatage.
function spokenTurns(call: Call, startedAt: number): ConnectorTurn[] {
  const emails = emailsByName(call);
  return paragraphs(call.simple_transcript ?? '').flatMap((paragraph, index): ConnectorTurn[] => {
    const text = paragraph.lines.join('\n').trim();
    if (text === '') return [];
    const name = paragraph.speaker;
    return [
      {
        externalId: `utterance:${index}`,
        role: 'participant',
        author: { name, email: (name && emails.get(name.toLowerCase())) || null },
        text,
        ts: new Date(startedAt + paragraph.start * 1000).toISOString(),
      },
    ];
  });
}

// Le résumé écrit par l'outil : le champ « summary », sinon les réponses de la catégorie « summary ».
function summaryText(call: Call): string {
  const own = call.summary?.trim();
  if (own) return own;
  return call.prompts
    .filter((prompt) => prompt.category === 'summary')
    .flatMap((prompt) => prompt.completions)
    .map((completion) => completion.trim())
    .filter(Boolean)
    .join('\n\n');
}

// Seulement un lien https : le lien est affiché tel quel dans l'interface.
function httpsUrl(value: string | null | undefined): string | null {
  try {
    return new URL(value ?? '').protocol === 'https:' ? (value ?? '').trim() : null;
  } catch {
    return null;
  }
}

// Le résumé ne sert que sans transcription. Un appel sans aucun texte n'est pas rendu.
export function callToItem(call: Call): ConnectorItem | null {
  const startedAt = Date.parse(call.performed_at ?? call.created_at ?? call.updated_at);
  const spoken = mergeSpeakerTurns(spokenTurns(call, startedAt));
  const summary = summaryText(call);
  const turns: ConnectorTurn[] =
    spoken.length > 0 || summary === ''
      ? spoken
      : [
          {
            externalId: 'summary',
            role: 'document',
            author: { name: null, email: null },
            text: summary,
            ts: call.updated_at,
          },
        ];
  if (turns.length === 0) return null;
  const participants = participantNames(call, spoken);
  return {
    externalId: `call:${call.uuid}`,
    nature: 'reunion',
    title: call.title?.trim() || NO_TITLE,
    url: httpsUrl(call.leexi_url),
    updatedAt: call.updated_at,
    origin: participants === '' ? {} : { participants },
    turns,
  };
}
