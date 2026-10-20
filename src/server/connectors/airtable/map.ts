import type { ConnectorItem, ConnectorTurn } from '../types';
import type { AirComment, AirRecord, Table } from './client';

// De la réponse d'Airtable à un élément du socle : les cellules de l'enregistrement forment le tour
// `document` (une ligne « Champ : valeur »), chaque commentaire un tour `participant`.

// Ce qui n'est pas du texte à retenir : identifiants de liens, pièces jointes (hors périmètre),
// boutons, et dates ou auteurs de l'enregistrement (lus à part).
const SKIPPED_TYPES = new Set([
  'multipleRecordLinks',
  'multipleAttachments',
  'button',
  'createdTime',
  'lastModifiedTime',
  'createdBy',
  'lastModifiedBy',
]);
const NAME_KEYS = ['name', 'email', 'text', 'label', 'value']; // collaborateur, code-barres, texte généré

// Le texte d'une cellule selon sa forme (la doc donne la forme de chaque type de champ).
function cellText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (value === true) return 'oui';
  if (Array.isArray(value)) {
    return value
      .map(cellText)
      .filter((text) => text !== '')
      .join(', ');
  }
  if (typeof value === 'object' && value !== null) {
    const object = value as Record<string, unknown>;
    for (const key of NAME_KEYS) {
      const text = object[key];
      if (typeof text === 'string' && text.trim() !== '') return text.trim();
    }
  }
  return '';
}

const line = (name: string, text: string): string =>
  text.includes('\n') ? `${name} :\n${text}` : `${name} : ${text}`;

// Dans l'ordre des champs de la table, puis les champs que la table ne décrit pas.
function bodyText(table: Table, record: AirRecord): string {
  const known = new Set(table.fields.map((field) => field.name));
  const names = [
    ...table.fields.filter((f) => !SKIPPED_TYPES.has(f.type)).map((f) => f.name),
    ...Object.keys(record.fields).filter((name) => !known.has(name)),
  ];
  const lines: string[] = [];
  for (const name of names) {
    const text = cellText(record.fields[name]);
    if (text !== '') lines.push(line(name, text));
  }
  return lines.join('\n');
}

// Le créateur si une colonne « créé par » existe, à défaut le dernier à avoir modifié.
function authorOf(table: Table, record: AirRecord): ConnectorTurn['author'] {
  for (const type of ['createdBy', 'lastModifiedBy']) {
    const field = table.fields.find((f) => f.type === type);
    const person = field ? record.fields[field.name] : undefined;
    if (typeof person === 'object' && person !== null) {
      const { name, email } = person as { name?: unknown; email?: unknown };
      return {
        name: typeof name === 'string' ? name : null,
        email: typeof email === 'string' ? email : null,
      };
    }
  }
  return { name: null, email: null };
}

// « @[usrXXX] » devient « @Marie Durand » grâce à l'objet `mentioned`.
function commentText(comment: AirComment): string {
  return comment.text
    .replace(/@\[(\w+)\]/g, (_all, id: string) => {
      const user = comment.mentioned?.[id];
      return `@${user?.displayName ?? user?.email ?? 'utilisateur'}`;
    })
    .trim();
}

function commentTurns(comments: AirComment[]): ConnectorTurn[] {
  const byDate = (a: AirComment, b: AirComment) =>
    Date.parse(a.createdTime) - Date.parse(b.createdTime) || a.id.localeCompare(b.id);
  return [...comments].sort(byDate).flatMap((comment) => {
    const text = commentText(comment);
    if (!text) return []; // une pièce jointe seule, par exemple
    const turn: ConnectorTurn = {
      externalId: `comment:${comment.id}`,
      role: 'participant',
      author: { name: comment.author?.name ?? null, email: comment.author?.email ?? null },
      text,
      ts: new Date(comment.createdTime).toISOString(),
    };
    return [turn];
  });
}

export type RecordContext = {
  baseId: string;
  baseName: string;
  table: Table;
  record: AirRecord;
  comments: AirComment[];
  at: number; // fin de la fenêtre où l'enregistrement a été lu : au plus tôt sa modification
};

// Un enregistrement sans texte ni commentaire n'est pas rendu : un titre seul n'apprend rien.
export function toItem(input: RecordContext): ConnectorItem | null {
  const { baseId, baseName, table, record } = input;
  const updatedAt = new Date(input.at).toISOString();
  const turns: ConnectorTurn[] = [];
  const text = bodyText(table, record);
  if (text !== '') {
    turns.push({
      externalId: 'body',
      role: 'document',
      author: authorOf(table, record),
      text,
      ts: updatedAt,
    });
  }
  turns.push(...commentTurns(input.comments));
  if (turns.length === 0) return null;
  const primary = table.fields.find((field) => field.id === table.primaryFieldId);
  const name = primary ? cellText(record.fields[primary.name]) : '';
  return {
    externalId: `record:${baseId}/${table.id}/${record.id}`,
    nature: 'note',
    title: `${table.name} : ${name || record.id}`,
    url: `https://airtable.com/${baseId}/${table.id}/${record.id}`,
    updatedAt,
    origin: { base: baseName, table: table.name },
    turns,
  };
}
