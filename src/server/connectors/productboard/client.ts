import { z } from 'zod';
import { type ConnectorHttp, ConnectorHttpError } from '../http';

// Les requêtes vers l'API v2 de Productboard et la forme des réponses lues (seulement les champs
// utiles). La doc se contredit sur la place des dates (à la racine de la note, ou dans `fields`) :
// les deux sont lues. Les dates restent des textes ici ; `map.ts` écarte celles qu'il ne comprend pas.

const API = 'https://api.productboard.com/v2';
const PAGES_MAX = 1000; // garde-fou : jamais de lecture sans fin

const Member = z.object({ id: z.string().nullish(), email: z.string().nullish() }).nullish();
const Tag = z.union([z.string(), z.object({ name: z.string() })]);

export const NoteSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().nullish(),
  updatedAt: z.string().nullish(),
  fields: z
    .object({
      name: z.string().nullish(),
      // Un texte (note simple), des prises de parole (conversation) ou des champs (opportunité).
      content: z.unknown(),
      tags: z.array(Tag).nullish(),
      owner: Member,
      creator: Member,
      createdAt: z.string().nullish(),
      updatedAt: z.string().nullish(),
    })
    .nullish(),
  links: z.object({ html: z.string().nullish() }).nullish(),
});
export type Note = z.infer<typeof NoteSchema>;

const NotesReply = z.object({
  data: z.array(NoteSchema),
  links: z.object({ next: z.string().nullish() }).nullish(),
});

// `links.next` est une adresse qui porte le curseur de la page suivante (la doc de la liste dit aussi
// « passez-le en pageCursor ») : on ne garde que le curseur, et la requête suivante repart de notre
// adresse, avec nos filtres, sur l'hôte de l'API. Une adresse sans curseur lisible est refusée : la
// lire de travers tronquerait la liste en silence.
function cursorOf(next: string): string {
  if (/^https?:\/\//i.test(next) || next.includes('pageCursor=')) {
    try {
      const cursor = new URL(next, API).searchParams.get('pageCursor');
      if (cursor) return cursor;
    } catch {
      // adresse illisible : refusée ci-dessous
    }
    throw new ConnectorHttpError(null, 'Unexpected response');
  }
  return next;
}

export function productboardClient(token: string, http: ConnectorHttp) {
  const headers = { Authorization: `Bearer ${token}` };
  const list = (query: Record<string, string | boolean | string[] | undefined>) =>
    http.json({ url: `${API}/notes`, headers, query }, NotesReply);

  return {
    // Les notes d'une heure, réduites à leur nom : de quoi savoir que le jeton lit les notes.
    async probe(since: Date): Promise<void> {
      await list({ archived: false, updatedFrom: since.toISOString(), 'fields[]': ['name'] });
    },

    // Toutes les notes modifiées depuis `from` (bornes comprises), hors notes archivées. Productboard
    // les rend de la plus récemment créée à la plus ancienne et ne propose aucun tri : on lit tout.
    // Un doublon (une note qui change de page pendant la lecture) est écarté par identifiant ; un
    // curseur déjà vu (la dernière page qui renvoie la première) arrête la lecture.
    async notesUpdatedFrom(from: Date): Promise<Note[]> {
      const notes = new Map<string, Note>();
      const cursors = new Set<string>();
      let pageCursor: string | undefined;
      for (let page = 0; page < PAGES_MAX; page++) {
        const reply = await list({ archived: false, updatedFrom: from.toISOString(), pageCursor });
        for (const note of reply.data) if (!notes.has(note.id)) notes.set(note.id, note);
        const next = reply.links?.next ? cursorOf(reply.links.next) : null;
        if (next === null || cursors.has(next)) return [...notes.values()];
        cursors.add(next);
        pageCursor = next;
      }
      throw new ConnectorHttpError(null, 'Productboard: too many pages of notes to read');
    },
  };
}

export type ProductboardClient = ReturnType<typeof productboardClient>;
