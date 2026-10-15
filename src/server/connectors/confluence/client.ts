import { z } from 'zod';
import type { ConnectorHttp, HttpRequest } from '../http';
import { type AtlassianConfig, atlassianAccess } from '../jira/access';

// Les requêtes vers l'API de Confluence Cloud et la forme des réponses lues (seulement les champs
// utiles). Version 1 pour le compte courant (la 2 n'en a pas), version 2 pour tout le reste.
// Avec une clé : l'adresse du site, en Basic. Avec le bouton : api.atlassian.com/ex/confluence/<cloudId>,
// en Bearer ; `site` reste le sous-domaine, pour les adresses web des pages.

export type Api = {
  http: ConnectorHttp;
  site: string;
  wiki: string;
  prefix: string;
  authorization: string;
};

export function createApi(http: ConnectorHttp, config: AtlassianConfig): Api {
  const { site, root, prefix, authorization } = atlassianAccess(config, 'confluence');
  return { http, site, wiki: `${root}/wiki`, prefix, authorization };
}

export const wikiUrl = (site: string) => `https://${site}.atlassian.net/wiki`;
const v2 = (api: Api) => `${api.wiki}/api/v2`;

const PAGE_SIZE = '250'; // le maximum de l'API
const DateTime = z.iso.datetime({ offset: true });
const Version = z.object({ createdAt: DateTime, authorId: z.string().nullish() });
const Body = z.object({ storage: z.object({ value: z.string() }).nullish() }).nullish();

const Me = z.object({
  type: z.string().nullish(),
  displayName: z.string().nullish(),
  publicName: z.string().nullish(),
});
// Dans la liste, seulement de quoi trier : le corps se lit page par page.
const PageStub = z.object({ id: z.string(), version: z.object({ createdAt: DateTime }) });
const Page = z.object({
  id: z.string(),
  title: z.string(),
  spaceId: z.string().nullish(),
  authorId: z.string().nullish(),
  version: Version,
  body: Body,
  _links: z.object({ webui: z.string().nullish() }).nullish(),
});
const Comment = z.object({ id: z.string(), version: Version, body: Body });
const User = z.object({
  accountId: z.string(),
  displayName: z.string().nullish(),
  publicName: z.string().nullish(),
  email: z.string().nullish(),
});
const Space = z.object({ id: z.string(), key: z.string() });
const list = <T extends z.ZodType>(item: T) => z.object({ results: z.array(item) });

export type PageStub = z.infer<typeof PageStub>;
export type ConfluencePage = z.infer<typeof Page>;
export type ConfluenceComment = z.infer<typeof Comment>;

const authed = (api: Api, request: HttpRequest): HttpRequest => ({
  ...request,
  headers: { authorization: api.authorization },
});

// L'adresse de la page suivante vient de l'en-tête Link. Les paramètres de la requête d'origine y sont
// remis (remplacés, jamais répétés) : on ne suppose pas qu'elle les garde tous. Le lien est relatif à
// /wiki (« </wiki/api/v2/pages?cursor=…> ») : par api.atlassian.com, on ne suppose pas qu'il garde
// /ex/confluence/<cloudId>, on le remet s'il manque.
function withQuery(api: Api, nextUrl: string, query: Record<string, string>): string {
  const url = new URL(nextUrl);
  if (api.prefix !== '' && !url.pathname.startsWith(`${api.prefix}/`)) {
    url.pathname = `${api.prefix}${url.pathname}`;
  }
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  return url.toString();
}

// Les réponses d'une liste, l'une après l'autre.
async function* pagesOf<T>(
  api: Api,
  url: string,
  query: Record<string, string>,
  schema: z.ZodType<T>,
) {
  let request = authed(api, { url, query });
  for (;;) {
    const { data, nextUrl } = await api.http.page(request, schema);
    yield data;
    if (nextUrl === null) return;
    request = authed(api, { url: withQuery(api, nextUrl, query) });
  }
}

async function readAll<T>(items: AsyncIterable<{ results: T[] }>): Promise<T[]> {
  const all: T[] = [];
  for await (const batch of items) all.push(...batch.results);
  return all;
}

export function fetchMe(api: Api) {
  return api.http.json(authed(api, { url: `${api.wiki}/rest/api/user/current` }), Me);
}

// Les pages courantes, la plus récemment modifiée d'abord : une réponse par appel.
export function listPageStubs(api: Api) {
  const query = { sort: '-modified-date', status: 'current', limit: PAGE_SIZE };
  return pagesOf(api, `${v2(api)}/pages`, query, list(PageStub));
}

export function fetchPage(api: Api, id: string) {
  const request = authed(api, {
    url: `${v2(api)}/pages/${id}`,
    query: { 'body-format': 'storage' },
  });
  return api.http.json(request, Page);
}

// Les commentaires de pied de page au premier niveau, puis les réponses à l'un d'eux.
export function fetchComments(api: Api, pageId: string) {
  const query = {
    'body-format': 'storage',
    sort: 'created-date',
    status: 'current',
    limit: PAGE_SIZE,
  };
  return readAll(pagesOf(api, `${v2(api)}/pages/${pageId}/footer-comments`, query, list(Comment)));
}

export function fetchReplies(api: Api, commentId: string) {
  const query = { 'body-format': 'storage', sort: 'created-date', limit: PAGE_SIZE };
  return readAll(
    pagesOf(api, `${v2(api)}/footer-comments/${commentId}/children`, query, list(Comment)),
  );
}

export async function fetchUsers(api: Api, accountIds: string[]) {
  const request = authed(api, {
    url: `${v2(api)}/users-bulk`,
    method: 'POST',
    body: { accountIds },
  });
  return (await api.http.json(request, list(User))).results;
}

export async function fetchSpaces(api: Api, spaceIds: string[]) {
  const query = { ids: spaceIds.join(','), limit: PAGE_SIZE };
  return (await api.http.json(authed(api, { url: `${v2(api)}/spaces`, query }), list(Space)))
    .results;
}
