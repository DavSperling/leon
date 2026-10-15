import { z } from 'zod';
import type { ConnectorHttp } from '../http';

// Les requêtes vers l'API web d'Airtable et la forme des réponses lues (seulement les champs utiles).

const API = 'https://api.airtable.com/v0';
const RECORDS_PER_PAGE = 100; // le maximum d'Airtable
const COMMENT_PAGES_MAX = 3; // soit 300 commentaires, les plus récents d'abord
const BASE_PAGES_MAX = 5; // 1 000 bases par page

const Time = z.iso.datetime({ offset: true });
const Person = z.object({ name: z.string().nullish(), email: z.string().nullish() });

const TableSchema = z.object({
  id: z.string(),
  name: z.string(),
  primaryFieldId: z.string(),
  fields: z.array(z.object({ id: z.string(), name: z.string(), type: z.string() })),
});
const RecordSchema = z.object({
  id: z.string(),
  // Airtable n'envoie pas les cellules vides ; la valeur dépend du type de champ.
  fields: z.record(z.string(), z.unknown()),
  commentCount: z.number().optional(), // seulement avec recordMetadata
});
const CommentSchema = z.object({
  id: z.string(),
  author: Person.nullish(),
  text: z.string(),
  createdTime: Time,
  mentioned: z
    .record(
      z.string(),
      z.object({ displayName: z.string().nullish(), email: z.string().nullish() }),
    )
    .nullish(),
});

export type Table = z.infer<typeof TableSchema>;
export type AirRecord = z.infer<typeof RecordSchema>;
export type AirComment = z.infer<typeof CommentSchema>;

const WhoamiReply = z.object({ id: z.string(), email: z.string().nullish() });
const BasesReply = z.object({
  bases: z.array(z.object({ id: z.string(), name: z.string() })),
  offset: z.string().nullish(),
});
const TablesReply = z.object({ tables: z.array(TableSchema) });
const RecordsReply = z.object({ records: z.array(RecordSchema), offset: z.string().nullish() });
const CommentsReply = z.object({ comments: z.array(CommentSchema), offset: z.string().nullish() });

// Les enregistrements modifiés après `from` et au plus tard à `to` (millisecondes). Airtable ne
// rend pas la date de modification d'un enregistrement et ne trie pas dessus : c'est la fenêtre
// qui date.
const modifiedBetween = (from: number, to: number): string => {
  const at = (millis: number) => `"${new Date(millis).toISOString()}"`;
  return `AND(IS_AFTER(LAST_MODIFIED_TIME(), ${at(from)}), NOT(IS_AFTER(LAST_MODIFIED_TIME(), ${at(to)})))`;
};

export function airtableClient(token: string, http: ConnectorHttp) {
  const headers = { Authorization: `Bearer ${token}` };
  const path = (id: string) => encodeURIComponent(id);

  return {
    async whoami(): Promise<{ id: string; email: string | null }> {
      const me = await http.json({ url: `${API}/meta/whoami`, headers }, WhoamiReply);
      return { id: me.id, email: me.email ?? null };
    },

    // Les noms des bases que le jeton voit, par identifiant.
    async baseNames(): Promise<Map<string, string>> {
      const names = new Map<string, string>();
      let offset: string | undefined;
      for (let page = 0; page < BASE_PAGES_MAX; page++) {
        const reply = await http.json(
          { url: `${API}/meta/bases`, headers, query: { offset } },
          BasesReply,
        );
        for (const base of reply.bases) names.set(base.id, base.name);
        if (!reply.offset) break;
        offset = reply.offset;
      }
      return names;
    },

    async tables(baseId: string): Promise<Table[]> {
      const url = `${API}/meta/bases/${path(baseId)}/tables`;
      return (await http.json({ url, headers }, TablesReply)).tables;
    },

    // Toutes les pages de la fenêtre. Un POST plutôt qu'un GET : la formule reste hors de l'adresse
    // et les listes ne demandent pas de notation à crochets.
    async records(baseId: string, tableId: string, from: number, to: number): Promise<AirRecord[]> {
      const url = `${API}/${path(baseId)}/${path(tableId)}/listRecords`;
      const records: AirRecord[] = [];
      let offset: string | undefined;
      do {
        const body = {
          filterByFormula: modifiedBetween(from, to),
          pageSize: RECORDS_PER_PAGE,
          recordMetadata: ['commentCount'],
          ...(offset ? { offset } : {}),
        };
        const reply = await http.json({ url, method: 'POST', headers, body }, RecordsReply);
        records.push(...reply.records);
        offset = reply.offset && reply.offset !== offset ? reply.offset : undefined;
      } while (offset);
      return records;
    },

    // Du plus récent au plus ancien ; la page suivante part de l'offset reçu.
    async comments(baseId: string, tableId: string, recordId: string): Promise<AirComment[]> {
      const url = `${API}/${path(baseId)}/${path(tableId)}/${path(recordId)}/comments`;
      const comments: AirComment[] = [];
      let offset: string | undefined;
      for (let page = 0; page < COMMENT_PAGES_MAX; page++) {
        const reply = await http.json({ url, headers, query: { offset } }, CommentsReply);
        comments.push(...reply.comments);
        if (!reply.offset) break;
        offset = reply.offset;
      }
      return comments;
    },
  };
}

export type AirtableClient = ReturnType<typeof airtableClient>;
