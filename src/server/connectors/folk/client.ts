import { z } from 'zod';
import type { ConnectorHttp, HttpRequest } from '../http';

// Les requêtes vers l'API de folk et la forme des réponses lues (seulement les champs utiles ;
// folk demande d'ignorer les champs qu'il ajoute).

const API = 'https://api.folk.app/v1';
// La version est épinglée : sans l'en-tête, folk répond dans sa dernière version.
const API_VERSION = '2025-06-09';
// Le maximum est 100 ; une note peut peser 100 000 caractères, et la réponse est limitée à 10 Mo.
const NOTES_PER_PAGE = 50;

// Un auteur est un utilisateur (nom et e-mail), l'assistant de folk (nom seul) ou un compte
// supprimé (ni l'un ni l'autre).
const Author = z.object({ fullName: z.string().nullish(), email: z.string().nullish() }).nullish();

// La note parente d'une réponse : folk la rend en entier, sauf si elle est supprimée (alors
// seulement `id` et `deleted`) ou masquée à la clé (alors `content` est nul).
const ParentNote = z.object({
  id: z.string(),
  content: z.string().nullish(),
  visibility: z.string().nullish(),
  author: Author,
  createdAt: z.string().nullish(),
  deleted: z.boolean().nullish(),
});

export const NoteSchema = z.object({
  id: z.string(),
  entity: z.object({ entityType: z.string().nullish(), fullName: z.string().nullish() }).nullish(),
  content: z.string().nullish(),
  visibility: z.string().nullish(),
  author: Author,
  createdAt: z.string().nullish(), // nul pour une note ancienne
  parentNote: ParentNote.nullish(), // renseigné quand la note répond à une autre
});
export type Note = z.infer<typeof NoteSchema>;

const UserReply = z.object({
  data: z.object({ fullName: z.string(), email: z.string().nullish() }),
});
// À la dernière page, `pagination` est vide : sans `nextLink`.
const NotesReply = z.object({
  data: z.object({
    items: z.array(NoteSchema),
    pagination: z.object({ nextLink: z.string().nullish() }).nullish(),
  }),
});

export function folkClient(apiKey: string, http: ConnectorHttp) {
  const headers = { Authorization: `Bearer ${apiKey}`, 'X-API-Version': API_VERSION };

  return {
    async me(): Promise<{ fullName: string; email: string | null }> {
      const reply = await http.json({ url: `${API}/users/me`, headers }, UserReply);
      return { fullName: reply.data.fullName, email: reply.data.email ?? null };
    },

    // Toutes les notes créées après `after`. folk ne documente aucun tri : on lit la liste
    // entière, et l'appelant la trie. Chaque page suivante est le lien `nextLink` de la
    // précédente, qui porte déjà le filtre et le curseur.
    async notesCreatedAfter(after: Date): Promise<Note[]> {
      const byId = new Map<string, Note>();
      let request: HttpRequest = {
        url: `${API}/notes`,
        headers,
        query: { limit: NOTES_PER_PAGE, createdAfter: after.toISOString() },
      };
      for (;;) {
        const { data } = await http.json(request, NotesReply);
        const known = byId.size;
        for (const note of data.items) byId.set(note.id, note);
        const next = data.pagination?.nextLink;
        // Une page sans nouveauté : le lien tourne en rond, on ne boucle pas.
        if (!next || byId.size === known) return [...byId.values()];
        request = { url: next, headers };
      }
    },
  };
}

export type FolkClient = ReturnType<typeof folkClient>;
