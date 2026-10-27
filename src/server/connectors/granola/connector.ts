import { z } from 'zod';
import type { Connector, ConnectorItem } from '../types';
import { granolaClient, type NoteSummary } from './client';
import { mapNote } from './map';

// Doc lue le 15/10/2026 :
//   https://docs.granola.ai/introduction (clé, portées, limites, pagination)
//   https://docs.granola.ai/api-reference/list-notes, get-note, get-transcript, changelog
//   https://docs.granola.ai/help-center/sharing/integrations/granola-api (plans)
// Hôte : public-api.granola.ai (et non docs.granola.ai, qui n'est que la doc). Clé « grn_… » en
// Bearer. 5 requêtes par seconde (rafale de 25 sur 5 s) : 200 ms entre deux requêtes.
// Une note n'existe pour l'API qu'avec résumé et transcription.
//
// Non vérifié (aucune clé, aucun appel réel) :
// - l'ordre de la liste n'est pas documenté : on la lit en entier et on trie par mise à jour ;
// - updated_after, inclusif ou non : le curseur retient les notes déjà rendues à cet instant ;
// - start_time est supposé absolu (ISO 8601 avec Z), comme dans les exemples de la doc, dont
//   les heures de début et de fin sont toutes identiques ;
// - le corps du 413 « transcription trop grande » n'est pas documenté : on se fie au code ;
// - un 403 n'est documenté nulle part : sur la transcription paginée, la note sort avec son résumé ;
// - pas de point d'accès « compte » : verify ne fait que lire une note.
// Les notes privées (private_notes_*) ne sont pas lues. Une note sans texte n'est pas rendue.

const configSchema = z.object({ apiKey: z.string().trim().min(1) });
export type GranolaConfig = z.infer<typeof configSchema>;

const PAGE_ITEMS = 20; // notes par page rendue : le curseur avance souvent, sans attendre 200 notes

// Le curseur : l'instant de la dernière note rendue, et les notes déjà rendues à cet instant.
const cursorSchema = z.object({ updatedAt: z.string(), ids: z.array(z.string()) });
type Cursor = z.infer<typeof cursorSchema>;

function readCursor(raw: string | null): Cursor | null {
  if (raw === null) return null;
  try {
    const cursor = cursorSchema.parse(JSON.parse(raw));
    return { updatedAt: new Date(cursor.updatedAt).toISOString(), ids: cursor.ids };
  } catch {
    return null; // illisible : on repart de since, les tours déjà connus ne se recréent pas
  }
}

const instant = (date: string) => new Date(date).getTime();

function advance(cursor: Cursor | null, note: NoteSummary): Cursor {
  const updatedAt = new Date(note.updated_at).toISOString();
  return cursor?.updatedAt === updatedAt
    ? { updatedAt, ids: [...cursor.ids, note.id] }
    : { updatedAt, ids: [note.id] };
}

export const granolaConnector: Connector<GranolaConfig> = {
  id: 'granola',
  configSchema,
  secretFields: ['apiKey'],
  hosts: () => ['public-api.granola.ai'],
  minIntervalMs: 200,

  async verify(config, http) {
    const found = await granolaClient(config.apiKey, http).hasNotes();
    return {
      account: found ? 'Granola (readable notes)' : 'Granola (no readable notes yet)',
    };
  },

  async *sync(config, state, http) {
    const client = granolaClient(config.apiKey, http);
    const resumed = readCursor(state.cursor);
    const from = resumed?.updatedAt ?? state.since.toISOString();
    // Une note déjà rendue à l'instant du curseur peut revenir si le filtre de l'API est inclusif.
    const renderedIds = new Set(resumed?.ids);
    const renderedAt = resumed ? instant(resumed.updatedAt) : Number.NaN;
    const alreadyRendered = (note: NoteSummary) =>
      renderedIds.has(note.id) && instant(note.updated_at) === renderedAt;
    const notes = (await client.listNotes(from))
      .filter((note) => !note.deleted_at && !alreadyRendered(note))
      .sort((a, b) => instant(a.updated_at) - instant(b.updated_at) || a.id.localeCompare(b.id));

    let cursor = resumed;
    for (let start = 0; start < notes.length; start += PAGE_ITEMS) {
      const items: ConnectorItem[] = [];
      for (const summary of notes.slice(start, start + PAGE_ITEMS)) {
        const read = await client.readNote(summary.id);
        const item = read && mapNote(read.note, read.transcript);
        if (item) items.push(item);
        cursor = advance(cursor, summary);
      }
      yield { items, cursor: JSON.stringify(cursor) };
    }
  },
};
