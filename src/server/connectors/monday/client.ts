import { z } from 'zod';
import { PROVIDER_LABELS } from '@/lib/providers';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';
import {
  ACCOUNT_QUERY,
  BOARDS_QUERY,
  FIRST_ITEMS_QUERY,
  type ItemsPage,
  itemsPage,
  NEXT_ITEMS_QUERY,
} from './queries';

// Les requêtes vers monday.com (GraphQL) et la lecture de leurs réponses.

const LABEL = PROVIDER_LABELS.monday;
const ENDPOINT = 'https://api.monday.com/v2';
// Dernière version stable de la doc au 15/10/2026 (la 2026-10 y figure encore en préversion) : sans
// cet en-tête, l'outil change de version tout seul tous les trois mois.
const API_VERSION = '2026-07';

const BOARDS_PAGE_SIZE = 50;
// Chaque élément porte ses colonnes et ses 25 dernières mises à jour avec leurs réponses : 25
// éléments par requête restent très loin du plafond de complexité (5 000 000 de points).
const ITEMS_PAGE_SIZE = 25;

// Seul le code des erreurs est lu, jamais leur texte : il peut citer la requête.
const apiError = z.object({ extensions: z.object({ code: z.string().optional() }).optional() });
const answer = z.object({ data: z.unknown().optional(), errors: z.array(apiError).optional() });

// « Rate Limit Exceeded », « rate_limit_exceeded »… : on compare sans espaces, tirets bas ni casse.
const LIMIT_CODES = new Set([
  'complexityexception',
  'complexitybudgetexhausted',
  'dailylimitexceeded',
  'ipratelimitexceeded',
  'maxconcurrencyexceeded',
  'ratelimitexceeded',
]);
const key = (code: string | undefined) => (code ?? '').toLowerCase().replace(/[\s_]/g, '');

// 404 : le tableau n'existe plus ou n'est plus visible. 410 : le curseur de l'outil a expiré (60
// minutes après la première requête) ; sa valeur exacte, `CursorException`, vient d'un échange sur le
// forum de l'éditeur, pas de la doc. Les deux sont rattrapés par la lecture d'un tableau.
function failure(errors: z.infer<typeof apiError>[]): Error {
  const codes = errors.map((error) => key(error.extensions?.code));
  const has = (...names: string[]) => codes.some((code) => names.includes(code));
  if (has('unauthorized')) return new ConnectorAuthError(LABEL, 401);
  if (has('userunauthorizedexception', 'useraccessdenied'))
    return new ConnectorAuthError(LABEL, 403);
  if (codes.some((code) => LIMIT_CODES.has(code))) {
    return new ConnectorHttpError(429, `Limite de requêtes de ${LABEL} atteinte`);
  }
  if (has('invalidboardidexception', 'resourcenotfoundexception')) {
    return new ConnectorHttpError(404, `${LABEL} ne trouve pas la ressource`);
  }
  if (has('cursorexception', 'invalidcursorexception')) {
    return new ConnectorHttpError(410, `Curseur de ${LABEL} expiré`);
  }
  return new ConnectorHttpError(400, `${LABEL} a refusé la requête`);
}

async function graphql<T>(
  http: ConnectorHttp,
  token: string,
  query: string,
  variables: Record<string, unknown>,
  data: z.ZodType<T>,
): Promise<T> {
  const response = await http.json(
    {
      url: ENDPOINT,
      method: 'POST',
      // Le jeton personnel s'envoie tel quel, sans « Bearer » (doc « Authentication »).
      headers: { Authorization: token, 'API-Version': API_VERSION },
      body: { query, variables },
    },
    answer,
  );
  if (response.errors?.length) throw failure(response.errors);
  const parsed = data.safeParse(response.data);
  if (!parsed.success) throw new ConnectorHttpError(null, 'Réponse inattendue');
  return parsed.data;
}

const Id = z.union([z.string(), z.number()]).transform(String);

export async function fetchAccount(
  http: ConnectorHttp,
  token: string,
): Promise<{ account: string; accountKey: string }> {
  const schema = z.object({
    me: z.object({ id: Id, name: z.string(), account: z.object({ id: Id, name: z.string() }) }),
  });
  const { me } = await graphql(http, token, ACCOUNT_QUERY, {}, schema);
  return { account: `${me.name} (${me.account.name})`, accountKey: `${me.id}:${me.account.id}` };
}

// Les tableaux actifs, les plus utilisés d'abord. Les tableaux de sous-éléments et les documents
// ne portent pas d'éléments à lire ici.
export async function fetchBoardIds(http: ConnectorHttp, token: string): Promise<string[]> {
  const schema = z.object({
    boards: z.array(z.object({ id: z.string(), type: z.string().nullable() })),
  });
  const ids: string[] = [];
  const seen = new Set<string>();
  for (let page = 1; ; page++) {
    const { boards } = await graphql(
      http,
      token,
      BOARDS_QUERY,
      { limit: BOARDS_PAGE_SIZE, page },
      schema,
    );
    const fresh = boards.filter((board) => !seen.has(board.id));
    for (const board of fresh) seen.add(board.id);
    ids.push(...fresh.filter((board) => board.type === 'board').map((board) => board.id));
    // Une page incomplète est la dernière ; une page déjà vue protège d'un outil qui ignorerait `page`.
    if (boards.length < BOARDS_PAGE_SIZE || fresh.length === 0) return ids;
  }
}

// Une page d'éléments d'un tableau, du plus récemment modifié au plus ancien.
export async function fetchItems(
  http: ConnectorHttp,
  token: string,
  boardId: string,
  after: string | null,
): Promise<ItemsPage> {
  if (after !== null) {
    const schema = z.object({ next_items_page: itemsPage });
    const variables = { cursor: after, limit: ITEMS_PAGE_SIZE };
    return (await graphql(http, token, NEXT_ITEMS_QUERY, variables, schema)).next_items_page;
  }
  const schema = z.object({ boards: z.array(z.object({ items_page: itemsPage })) });
  const variables = { ids: [boardId], limit: ITEMS_PAGE_SIZE };
  const data = await graphql(http, token, FIRST_ITEMS_QUERY, variables, schema);
  return data.boards[0]?.items_page ?? { cursor: null, items: [] };
}
