import type { ConnectorItem } from '../types';
import type { Note } from './client';

// De la note de folk à un élément du socle : un tour par note, daté de sa création (folk ne donne
// pas de date de modification). Une réponse à une autre note est un tour participant.

// Une date sans fuseau serait lue dans celui du serveur : on la refuse.
const WITH_ZONE = /(Z|[+-]\d{2}:?\d{2})$/;

export function createdAtOf(note: Note): Date | null {
  if (!note.createdAt || !WITH_ZONE.test(note.createdAt)) return null;
  const date = new Date(note.createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Une note privée reste privée : elle n'est pas rendue à l'équipe. Une note sans texte non plus.
export function toItem(note: Note, createdAt: Date): ConnectorItem | null {
  const text = note.content?.trim();
  if (note.visibility !== 'public' || !text) return null;
  const iso = createdAt.toISOString();
  const entityName = note.entity?.fullName ?? null;
  const entityType = note.entity?.entityType ?? null;
  return {
    externalId: `note:${note.id}`,
    nature: 'note',
    title: entityName ? `Note sur ${entityName}` : 'Note folk',
    url: null, // folk ne donne pas de lien vers une note
    updatedAt: iso,
    origin: {
      ...(entityName ? { entity: entityName } : {}),
      ...(entityType ? { entityType } : {}),
    },
    turns: [
      {
        externalId: 'body',
        role: note.parentNote ? 'participant' : 'document',
        author: { name: note.author?.fullName ?? null, email: note.author?.email ?? null },
        text,
        ts: iso,
      },
    ],
  };
}
