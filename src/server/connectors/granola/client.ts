import { z } from 'zod';
import {
  ConnectorAuthError,
  type ConnectorHttp,
  ConnectorHttpError,
  type HttpRequest,
} from '../http';

// Les requêtes vers l'API publique de Granola et la forme des réponses (seulement les champs lus).

const BASE = 'https://public-api.granola.ai';
const LIST_PAGE_SIZE = 30; // le maximum de la doc
const TRANSCRIPT_PAGE_SIZE = 100; // idem

const userSchema = z.object({ name: z.string().nullish(), email: z.string().nullish() });
const utteranceSchema = z.object({
  speaker: z.object({
    attribution: z.string().nullish(), // « me » (le propriétaire de la note) ou « them »
    diarization_label: z.string().nullish(), // « Speaker A », téléphone seulement
    name: z.string().nullish(),
  }),
  text: z.string(),
  start_time: z.string(),
});
const summarySchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  owner: userSchema.nullish(),
  updated_at: z.iso.datetime({ offset: true }),
  deleted_at: z.string().nullish(),
});
const noteSchema = summarySchema.extend({
  web_url: z.string().nullish(),
  calendar_event: z.object({ event_title: z.string().nullish() }).nullish(),
  attendees: z.array(userSchema).nullish(),
  summary_text: z.string().nullish(),
  summary_markdown: z.string().nullish(),
  transcript: z.array(utteranceSchema).nullish(),
});
const listSchema = z
  .object({ notes: z.array(summarySchema), hasMore: z.boolean(), cursor: z.string().nullish() })
  .transform(({ notes, ...rest }) => ({ ...rest, items: notes }));
const transcriptSchema = z
  .object({
    transcript: z.array(utteranceSchema),
    hasMore: z.boolean(),
    cursor: z.string().nullish(),
  })
  .transform(({ transcript, ...rest }) => ({ ...rest, items: transcript }));

export type NoteSummary = z.infer<typeof summarySchema>;
export type Note = z.infer<typeof noteSchema>;
export type Utterance = z.infer<typeof utteranceSchema>;

const isStatus = (error: unknown, status: number): boolean =>
  error instanceof ConnectorHttpError && error.status === status;

type Page<T> = { hasMore: boolean; cursor?: string | null; items: T[] };

// Suit le curseur de l'API jusqu'à la dernière page.
async function allPages<T>(
  fetchPage: (cursor: string | undefined) => Promise<Page<T>>,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await fetchPage(cursor);
    all.push(...page.items);
    if (!page.hasMore || !page.cursor) return all;
    cursor = page.cursor;
  }
}

export function granolaClient(apiKey: string, http: ConnectorHttp) {
  const request = (path: string, query?: HttpRequest['query']): HttpRequest => ({
    url: `${BASE}${path}`,
    headers: { authorization: `Bearer ${apiKey}` },
    query,
  });
  const notePath = (id: string) => `/v1/notes/${encodeURIComponent(id)}`;

  // Granola n'a pas de point d'accès « compte » : on essaie de lire une note.
  async function hasNotes(): Promise<boolean> {
    const page = await http.json(request('/v1/notes', { page_size: 1 }), listSchema);
    return page.items.length > 0;
  }

  // Tout ce qui a changé depuis la date. La doc ne dit rien de l'ordre : l'appelant trie.
  function listNotes(updatedAfter: string): Promise<NoteSummary[]> {
    return allPages((cursor) =>
      http.json(
        request('/v1/notes', { updated_after: updatedAfter, page_size: LIST_PAGE_SIZE, cursor }),
        listSchema,
      ),
    );
  }

  // Une transcription trop grande pour la note se lit par pages. Un 403 ici ne prive la note que de
  // sa transcription : elle sort avec son résumé.
  async function readTranscript(id: string): Promise<Utterance[]> {
    try {
      return await allPages((cursor) =>
        http.json(
          request(`${notePath(id)}/transcript`, { page_size: TRANSCRIPT_PAGE_SIZE, cursor }),
          transcriptSchema,
        ),
      );
    } catch (error) {
      if (error instanceof ConnectorAuthError && error.status === 403) return [];
      throw error;
    }
  }

  // null si la note n'existe plus (supprimée entre la liste et la lecture).
  async function readNote(id: string): Promise<{ note: Note; transcript: Utterance[] } | null> {
    try {
      const note = await http.json(request(notePath(id), { include: 'transcript' }), noteSchema);
      return { note, transcript: note.transcript ?? [] };
    } catch (error) {
      if (isStatus(error, 404)) return null;
      if (!isStatus(error, 413)) throw error;
    }
    const note = await http.json(request(notePath(id)), noteSchema);
    return { note, transcript: await readTranscript(id) };
  }

  return { hasNotes, listNotes, readNote };
}
