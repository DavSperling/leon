import { z } from 'zod';
import type { ConnectorHttp, HttpRequest } from '../http';

// Les requêtes vers l'API Notion et la forme des réponses lues (seulement les champs utiles).

// La version la plus récente de la doc (developers.notion.com/reference/versioning).
export const NOTION_VERSION = '2026-03-11';
const BASE = 'https://api.notion.com/v1';
const PAGE_SIZE = 100;

export type Api = { http: ConnectorHttp; token: string };

export const RichText = z.array(z.object({ plain_text: z.string() }));

const Reference = z.object({ id: z.string() });

// Un robot : son espace, et la personne qui l'a ajouté (bouton) ou l'espace lui-même (clé interne).
const Me = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string().nullish(),
  bot: z
    .object({
      owner: z.object({ user: z.object({ id: z.string() }).nullish() }).nullish(),
      workspace_id: z.string().nullish(),
      workspace_name: z.string().nullish(),
    })
    .nullish(),
});

// Un résultat de recherche est une page entière, ou seulement { object, id } quand la connexion n'a
// pas le droit de lire le contenu : ce second cas est refusé par ce schéma (« Réponse inattendue »).
const Page = z.object({
  object: z.literal('page'),
  id: z.string(),
  last_edited_time: z.string(),
  url: z.string().nullish(),
  created_by: Reference.nullish(),
  last_edited_by: Reference.nullish(),
  parent: z.object({ type: z.string() }).catchall(z.unknown()).nullish(),
  // Le titre est la propriété de type « title » ; les autres propriétés ne sont pas lues.
  properties: z
    .record(z.string(), z.object({ type: z.string(), title: z.unknown().optional() }))
    .nullish(),
});

// Le contenu d'un bloc est sous la clé de son type (block.paragraph, block.to_do…).
const Block = z
  .object({ id: z.string(), type: z.string(), has_children: z.boolean() })
  .catchall(z.unknown());

const Comment = z.object({
  id: z.string(),
  created_time: z.string(),
  created_by: Reference.nullish(),
  display_name: z.object({ resolved_name: z.string().nullish() }).nullish(),
  rich_text: RichText,
});

const User = z.object({
  name: z.string().nullish(),
  person: z.object({ email: z.string().nullish() }).nullish(),
});

function list<T extends z.ZodType>(item: T) {
  return z.object({
    results: z.array(item),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  });
}

export type NotionPage = z.infer<typeof Page>;
export type NotionBlock = z.infer<typeof Block>;
export type NotionComment = z.infer<typeof Comment>;

function authed(api: Api, request: HttpRequest): HttpRequest {
  const headers = { authorization: `Bearer ${api.token}`, 'notion-version': NOTION_VERSION };
  return { ...request, headers };
}

const at = (path: string, id: string) => `${BASE}/${path}/${encodeURIComponent(id)}`;

export function fetchMe(api: Api) {
  return api.http.json(authed(api, { url: `${BASE}/users/me` }), Me);
}

export function fetchUser(api: Api, id: string) {
  return api.http.json(authed(api, { url: at('users', id) }), User);
}

// Toutes les pages partagées avec la connexion, la plus récemment modifiée d'abord.
export function searchPages(api: Api, startCursor: string | undefined) {
  const body = {
    filter: { property: 'object', value: 'page' },
    sort: { timestamp: 'last_edited_time', direction: 'descending' },
    page_size: PAGE_SIZE,
    start_cursor: startCursor,
  };
  return api.http.json(authed(api, { url: `${BASE}/search`, method: 'POST', body }), list(Page));
}

// Lit une liste jusqu'au bout, une page de résultats après l'autre.
async function readAll<T>(
  fetchPage: (startCursor: string | undefined) => Promise<{
    results: T[];
    next_cursor: string | null;
    has_more: boolean;
  }>,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  do {
    const answer = await fetchPage(cursor);
    all.push(...answer.results);
    cursor = answer.has_more ? (answer.next_cursor ?? undefined) : undefined;
  } while (cursor !== undefined);
  return all;
}

// Les blocs du premier niveau sous un bloc ou une page.
export function fetchChildren(api: Api, parentId: string): Promise<NotionBlock[]> {
  return readAll((startCursor) =>
    api.http.json(
      authed(api, {
        url: `${at('blocks', parentId)}/children`,
        query: { page_size: PAGE_SIZE, start_cursor: startCursor },
      }),
      list(Block),
    ),
  );
}

// Les commentaires non résolus de la page elle-même (ceux d'un passage précis sont sur son bloc).
export function fetchComments(api: Api, pageId: string): Promise<NotionComment[]> {
  return readAll((startCursor) =>
    api.http.json(
      authed(api, {
        url: `${BASE}/comments`,
        query: { block_id: pageId, page_size: PAGE_SIZE, start_cursor: startCursor },
      }),
      list(Comment),
    ),
  );
}
