import { z } from 'zod';
import { htmlToText } from '../normalize';
import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Note } from './client';

// De la réponse de Productboard à un élément du socle (nature `note`). Le contenu a trois formes,
// reconnues à leur forme plutôt qu'au `type` de la note : un texte (note simple : un tour `document`),
// des prises de parole (conversation : un tour `participant` chacune, du côté lu dans `authorType`),
// des champs nom/valeur (opportunité : un tour `document` en lignes « nom : valeur »).
// Productboard ne donne pas le nom des membres sans le droit des informations personnelles, que
// Leon ne demande pas : un tour `document` n'a pas de nom d'auteur, et son adresse n'est gardée que
// si elle est lisible (sinon « [redacted] »).

// Une note dont aucune date ne se lit ne peut être ni ordonnée ni datée : elle est écartée.
export type Dated = { note: Note; updatedAt: string; at: number };

const readable = (date: string | null | undefined): date is string =>
  typeof date === 'string' && Number.isFinite(Date.parse(date));

export function dated(notes: Note[]): Dated[] {
  return notes.flatMap((note) => {
    const candidates = [
      note.updatedAt,
      note.fields?.updatedAt,
      note.createdAt,
      note.fields?.createdAt,
    ];
    const updatedAt = candidates.find(readable);
    return updatedAt ? [{ note, updatedAt, at: Date.parse(updatedAt) }] : [];
  });
}

// Du HTML (note saisie dans Productboard) est converti ; un texte brut ou en Markdown reste tel quel,
// avec ses retours à la ligne.
const looksLikeHtml = (text: string): boolean => /<\/?[a-z][^>]*>/i.test(text);
const toText = (text: string): string => (looksLikeHtml(text) ? htmlToText(text) : text).trim();

const PartSchema = z.object({
  externalId: z.string().min(1),
  authorName: z.string().nullish(),
  authorType: z.string().nullish(),
  content: z.string().nullish(),
  timestamp: z.string(),
});
const FieldSchema = z.object({
  name: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const emailOf = (note: Note): string | null => {
  const email = (note.fields?.creator ?? note.fields?.owner)?.email?.trim();
  return email && /^[^\s@]+@[^\s@]+$/.test(email) ? email : null;
};

const sideOf = (authorType: string | null | undefined): ConnectorTurn['side'] => {
  if (authorType === 'customer') return 'external';
  return authorType === 'agent' ? 'team' : undefined;
};

function conversationTurns(parts: unknown[]): ConnectorTurn[] {
  return parts
    .flatMap((part) => {
      const parsed = PartSchema.safeParse(part);
      return parsed.success && readable(parsed.data.timestamp) ? [parsed.data] : [];
    })
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .flatMap((part) => {
      const text = toText(part.content ?? '');
      if (text === '') return []; // une pièce jointe seule, par exemple
      const turn: ConnectorTurn = {
        externalId: `part:${part.externalId}`,
        role: 'participant',
        author: { name: part.authorName?.trim() || null, email: null },
        side: sideOf(part.authorType),
        text,
        ts: part.timestamp,
      };
      return [turn];
    });
}

function bodyText(content: unknown): { text: string; conversation: unknown[] } {
  if (typeof content === 'string') return { text: toText(content), conversation: [] };
  if (!Array.isArray(content)) return { text: '', conversation: [] };
  // Des prises de parole portent `timestamp` ; des champs d'opportunité portent `name` et `value`.
  const conversation = content.filter((part) => PartSchema.safeParse(part).success);
  const lines = content.flatMap((entry) => {
    const field = FieldSchema.safeParse(entry);
    return field.success ? [`${field.data.name} : ${field.data.value}`] : [];
  });
  return { text: lines.join('\n'), conversation };
}

const tagNames = (note: Note): string[] =>
  (note.fields?.tags ?? [])
    .map((tag) => (typeof tag === 'string' ? tag : tag.name).trim())
    .filter((name) => name !== '');

// Une note sans texte n'est pas rendue : son titre seul n'apprend rien.
export function toItem(
  { note, updatedAt }: Dated,
  workspace: string | undefined,
): ConnectorItem | null {
  const { text, conversation } = bodyText(note.fields?.content);
  const turns: ConnectorTurn[] =
    conversation.length > 0
      ? conversationTurns(conversation)
      : text === ''
        ? []
        : [
            {
              externalId: 'body',
              role: 'document',
              author: { name: null, email: emailOf(note) },
              text,
              ts: updatedAt, // le tour document vaut à la date de dernière modification
            },
          ];
  if (turns.length === 0) return null;
  const tags = tagNames(note);
  const html = note.links?.html;
  return {
    externalId: `note:${note.id}`,
    nature: 'note',
    title: note.fields?.name?.trim() || 'Note sans titre',
    url: html?.startsWith('https://') ? html : null,
    updatedAt,
    origin: {
      ...(workspace ? { workspace } : {}),
      ...(tags.length > 0 ? { tags: tags.join(', ') } : {}),
    },
    turns,
  };
}
