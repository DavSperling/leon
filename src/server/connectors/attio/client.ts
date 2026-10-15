import { z } from 'zod';
import type { ConnectorHttp } from '../http';

// Les requêtes vers l'API v2 d'Attio et la forme des réponses lues (seulement les champs utiles).

const API = 'https://api.attio.com/v2';
export const PAGE_SIZE = 50; // le maximum d'Attio pour les notes et les fils

// Attio écrit ses dates avec neuf décimales (« …49.061281000Z ») ; `Date` en garde trois.
const Timestamp = z.string().refine((text) => Number.isFinite(Date.parse(text)), 'Date illisible');
// L'auteur d'une note ou d'un commentaire. `id` est un membre de l'espace quand `type` le dit.
const Actor = z.object({ id: z.string().nullish(), type: z.string().nullish() }).nullish();
export type Actor = z.infer<typeof Actor>;

export const NoteSchema = z.object({
  id: z.object({ note_id: z.string() }),
  parent_object: z.string(),
  parent_record_id: z.string(),
  title: z.string().nullish(),
  content_plaintext: z.string().nullish(),
  created_by_actor: Actor,
  created_at: Timestamp,
});
export const CommentSchema = z.object({
  id: z.object({ comment_id: z.string() }),
  content_plaintext: z.string().nullish(),
  record: z.object({ record_id: z.string(), object_id: z.string() }).nullish(),
  created_at: Timestamp,
  author: Actor,
});
export const ThreadSchema = z.object({
  id: z.object({ thread_id: z.string() }),
  created_at: Timestamp,
  comments: z.array(CommentSchema),
});
const MemberSchema = z.object({
  id: z.object({ workspace_member_id: z.string() }),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  email_address: z.string().nullish(),
});

export type Note = z.infer<typeof NoteSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type Thread = z.infer<typeof ThreadSchema>;
export type Member = z.infer<typeof MemberSchema>;
// Le nom d'une fiche : un `full_name` (personne) ou une `value` (entreprise, affaire…).
export type RecordInfo = { web_url?: string | null; name?: Array<Record<string, unknown>> | null };

const SelfReply = z.object({ active: z.boolean(), workspace_name: z.string().nullish() });
const NotesReply = z.object({ data: z.array(NoteSchema) });
const ThreadsReply = z.object({ data: z.array(ThreadSchema) });
const MembersReply = z.object({ data: z.array(MemberSchema) });
const RecordReply = z.object({
  data: z.object({
    web_url: z.string().nullish(),
    values: z.object({ name: z.array(z.record(z.string(), z.unknown())).nullish() }).nullish(),
  }),
});

// Les pages vont par décalage et Attio ne dit pas dans quel ordre il les rend : on lit tout et on
// ne garde que ce que `keep` retient. Une page sans nouveauté (l'outil ignore le décalage, ou une
// insertion a décalé la page) arrête la lecture ; un doublon est écarté par identifiant.
async function readAll<T>(
  page: (offset: number) => Promise<T[]>,
  idOf: (row: T) => string,
  keep: (row: T) => boolean,
): Promise<T[]> {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const rows = await page(offset);
    let fresh = 0;
    for (const row of rows) {
      if (seen.has(idOf(row))) continue;
      seen.add(idOf(row));
      fresh += 1;
      if (keep(row)) kept.push(row);
    }
    if (rows.length < PAGE_SIZE || fresh === 0) return kept;
  }
}

export function attioClient(token: string, http: ConnectorHttp) {
  const headers = { Authorization: `Bearer ${token}` };
  const get = <T>(path: string, schema: z.ZodType<T>, query?: Record<string, number>) =>
    http.json({ url: `${API}${path}`, headers, query }, schema);

  return {
    async self(): Promise<z.infer<typeof SelfReply>> {
      return get('/self', SelfReply);
    },

    // Une note suffit à savoir si la clé a le droit d'en lire.
    async probeNotes(): Promise<void> {
      await get('/notes', NotesReply, { limit: 1 });
    },

    allNotes(keep: (note: Note) => boolean): Promise<Note[]> {
      const page = async (offset: number) =>
        (await get('/notes', NotesReply, { limit: PAGE_SIZE, offset })).data;
      return readAll(page, (note) => note.id.note_id, keep);
    },

    // Chaque fil porte au plus ses 80 premiers commentaires (les plus anciens).
    allThreads(keep: (thread: Thread) => boolean): Promise<Thread[]> {
      const page = async (offset: number) =>
        (await get('/threads', ThreadsReply, { limit: PAGE_SIZE, offset })).data;
      return readAll(page, (thread) => thread.id.thread_id, keep);
    },

    async members(): Promise<Member[]> {
      return (await get('/workspace_members', MembersReply)).data;
    },

    // `object` est un nom court (« people ») ou un identifiant : Attio accepte les deux.
    async record(object: string, recordId: string): Promise<RecordInfo> {
      const path = `/objects/${encodeURIComponent(object)}/records/${encodeURIComponent(recordId)}`;
      const { data } = await get(path, RecordReply);
      return { web_url: data.web_url, name: data.values?.name };
    },
  };
}

export type AttioClient = ReturnType<typeof attioClient>;
