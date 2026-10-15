import type { ConnectorItem, ConnectorTurn } from '../types';
import type { Note } from './client';

// De la note de folk à un élément du socle, daté de sa création (folk ne donne pas de date de
// modification). Une note seule est un tour document. Une réponse à une autre note a deux tours :
// la note parente (document, avec sa propre date) puis la réponse (participant) : sans le parent,
// « D'accord pour 12 000 € » ne veut rien dire.

// Une date sans fuseau serait lue dans celui du serveur : on la refuse.
const WITH_ZONE = /(Z|[+-]\d{2}:?\d{2})$/;

export function createdAtOf(note: { createdAt?: string | null }): Date | null {
  if (!note.createdAt || !WITH_ZONE.test(note.createdAt)) return null;
  const date = new Date(note.createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Le tour de la note parente, seulement si elle peut être partagée : publique, avec un texte et
// une date lisible (une date refusée ferait écarter toute la note par le socle). Une note privée
// de la clé est visible de la clé, mais ne doit pas remonter à l'équipe par une réponse.
function parentTurn(parent: Note['parentNote']): ConnectorTurn | null {
  const text = parent?.content?.trim();
  const createdAt = parent ? createdAtOf(parent) : null;
  if (!parent || parent.deleted || parent.visibility !== 'public' || !text || !createdAt)
    return null;
  return {
    externalId: 'parent',
    role: 'document',
    author: { name: parent.author?.fullName ?? null, email: parent.author?.email ?? null },
    text,
    ts: createdAt.toISOString(),
  };
}

// Une note privée reste privée : elle n'est pas rendue à l'équipe. Une note sans texte non plus.
export function toItem(note: Note, createdAt: Date): ConnectorItem | null {
  const text = note.content?.trim();
  if (note.visibility !== 'public' || !text) return null;
  const iso = createdAt.toISOString();
  const parent = parentTurn(note.parentNote);
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
      ...(parent ? [parent] : []),
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
