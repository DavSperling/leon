import { z } from 'zod';

// Ce qu'on demande à monday.com et la forme de ce qu'il répond (seulement les champs lus).

const UPDATES_MAX = 25;

export const ACCOUNT_QUERY = 'query Account { me { id name account { id name } } }';

export const BOARDS_QUERY = `query Boards($limit: Int!, $page: Int!) {
  boards(limit: $limit, page: $page, order_by: used_at) { id type }
}`;

// Un élément n'a pas de corps : son nom, ses colonnes (texte lisible) et ses mises à jour en tiennent
// lieu. Les mises à jour rendent les plus récentes d'abord.
const ITEM_FIELDS = `fragment ItemFields on Item {
  id name url created_at updated_at
  creator { name email }
  board { name workspace { name } }
  group { title }
  column_values { type text column { title } }
  updates(limit: ${UPDATES_MAX}) {
    id body created_at creator { name email }
    replies { id body created_at creator { name email } }
  }
}`;

// Doc « Items page » : la sélection par date de modification n'accepte que des périodes (« TODAY »,
// « LAST_WEEK »…), jamais un instant. On trie donc du plus récemment modifié au plus ancien (doc
// « Items page – autres types », ItemsQueryOrderBy) et on s'arrête à la date voulue.
export const FIRST_ITEMS_QUERY = `query Items($ids: [ID!], $limit: Int!) {
  boards(ids: $ids) {
    items_page(limit: $limit, query_params: { order_by: [{ column_id: "__last_updated__", direction: desc }] }) {
      cursor
      items { ...ItemFields }
    }
  }
}
${ITEM_FIELDS}`;

export const NEXT_ITEMS_QUERY = `query NextItems($cursor: String!, $limit: Int!) {
  next_items_page(cursor: $cursor, limit: $limit) { cursor items { ...ItemFields } }
}
${ITEM_FIELDS}`;

const user = z.object({ name: z.string().nullable(), email: z.string().nullable() }).nullable();
const reply = z.object({
  id: z.string(),
  body: z.string(),
  created_at: z.string().nullable(),
  creator: user,
});
const item = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  creator: user,
  board: z
    .object({ name: z.string(), workspace: z.object({ name: z.string() }).nullable() })
    .nullable(),
  group: z.object({ title: z.string() }).nullable(),
  column_values: z.array(
    z.object({
      type: z.string(),
      text: z.string().nullable(),
      column: z.object({ title: z.string() }),
    }),
  ),
  updates: z.array(reply.extend({ replies: z.array(reply) })),
});
export const itemsPage = z.object({ cursor: z.string().nullable(), items: z.array(item) });

export type MondayItem = z.infer<typeof item>;
export type MondayUser = z.infer<typeof user>;
export type ItemsPage = z.infer<typeof itemsPage>;
