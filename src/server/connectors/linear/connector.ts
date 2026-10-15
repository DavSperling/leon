import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp } from '../http';
import type { Connector, ConnectorItem, SyncPage } from '../types';
import {
  authorizationOf,
  fetchAccount,
  fetchIssues,
  fetchProjectUpdates,
  type Stream,
} from './client';
import { issueToItem, projectUpdateToItem } from './map';
import { linearOAuth } from './oauth';

// Doc lue le 15/10/2026 :
//   https://linear.app/developers/graphql (adresse, en-tête Authorization sans « Bearer » pour une clé
//     personnelle, erreurs dans `errors`, réponse 200 possible avec des erreurs partielles)
//   https://linear.app/developers/rate-limiting (HTTP 400 + extensions.code = RATELIMITED ; 2 500
//     requêtes et 3 000 000 points de complexité par heure ; 10 000 points au plus par requête)
//   https://linear.app/developers/pagination (first/after, pageInfo, orderBy createdAt|updatedAt)
//   https://linear.app/developers/filtering (updatedAt: { gt } accepte une date ISO 8601)
//   https://linear.app/docs/api-and-webhooks (création d'une clé : Réglages › Compte › Sécurité et accès)
//   schéma public : https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql
//   (issues, projectUpdates, DateComparator, ProjectUpdateFilter.updatedAt) et le SDK officiel,
//   packages/sdk/src/error.ts (extensions.type : « authentication error », « forbidden », « ratelimited »).
//
// Écart au plan : l'ordre. `orderBy: updatedAt` rend les plus récemment modifiés d'abord (doc
// « Pagination » : « To get most recently updated resources »), et l'argument `sort` qui donnerait
// l'ordre croissant est marqué [INTERNAL] dans le schéma : on ne s'y fie pas. Le curseur n'est donc
// pas une date mais la position dans un parcours du plus récent au plus ancien (voir Stream) ; à la
// fin du parcours, la date la plus récente vue devient le début du suivant.
// Les commentaires et les auteurs viennent dans la même requête que les tickets : il n'y a pas de
// ressource secondaire à part. Les mises à jour de projet, elles, se lisent à part : un 403 y est
// ignoré pour ne pas bloquer les tickets.
// Au-delà de 50 commentaires, un ticket sort avec les 50 que l'outil rend.
//
// Non vérifié (aucune clé réelle) : le sens exact de l'ordre de `orderBy: updatedAt` (supposé du
// plus récent au plus ancien ; le parcours reste juste dans l'autre sens, il refait seulement des
// éléments déjà vus) ; le statut HTTP et la valeur de extensions.code d'une clé refusée (HTTP 401
// ou HTTP 400 avec extensions.type = « authentication error » : les deux sont reconnus) ; la
// complexité exacte de la requête (calculée à la main, environ 6 600 points) ; ce que fait l'outil
// d'un curseur `after` dont l'élément a été modifié ou supprimé entre deux relèves ; si les
// réponses à un commentaire sont dans `comments` ou seulement dans `children` (non lues ici).

// Deux façons de se brancher : la clé personnelle (une connexion sans `authMode` est à clé) ou le
// bouton, dont le socle OAuth tient les jetons. Un `z.object` raffiné : le catalogue lit `.shape`.
const configSchema = z
  .object({
    authMode: z.enum(['key', 'oauth']).default('key'),
    apiKey: z.string().trim().min(1).optional(),
    accessToken: z.string().min(1).optional(),
    refreshToken: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
  })
  .superRefine((config, ctx) => {
    const field = config.authMode === 'oauth' ? 'accessToken' : 'apiKey';
    if (!config[field]) ctx.addIssue({ code: 'custom', path: [field], message: 'Requis' });
  });
type Config = z.infer<typeof configSchema>;

const stream = z.object({
  from: z.string(),
  top: z.string().nullable(),
  after: z.string().nullable(),
});
const cursorSchema = z.object({ issues: stream, updates: stream });
type Cursor = z.infer<typeof cursorSchema>;

// Un curseur illisible repart de `since` : l'ingestion est idempotente, au pire on refait du travail.
function readCursor(raw: string | null, since: Date): Cursor {
  let value: unknown = null;
  try {
    value = raw === null ? null : JSON.parse(raw);
  } catch {
    value = null;
  }
  const parsed = cursorSchema.safeParse(value);
  const fresh: Stream = { from: since.toISOString(), top: null, after: null };
  return parsed.success ? parsed.data : { issues: fresh, updates: fresh };
}

function newest(dates: Array<string | null>): string | null {
  const known = dates.filter((date): date is string => date !== null);
  return known.reduce<string | null>(
    (best, date) => (best === null || Date.parse(date) > Date.parse(best) ? date : best),
    null,
  );
}

type Fetched = { items: ConnectorItem[]; latest: string | null; next: string | null };
type Page<N> = { nodes: N[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };

function summarize<N extends { updatedAt: string }>(
  page: Page<N>,
  convert: (node: N) => ConnectorItem | null,
): Fetched {
  return {
    items: page.nodes.flatMap((node) => convert(node) ?? []),
    // Aussi pour un élément sans texte, qui n'est pas rendu : il a été vu.
    latest: newest(page.nodes.map((node) => node.updatedAt)),
    next: page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null,
  };
}

const STREAMS = [
  {
    key: 'issues',
    fetch: async (http: ConnectorHttp, authorization: string, from: Stream) =>
      summarize(await fetchIssues(http, authorization, from), issueToItem),
  },
  {
    key: 'updates',
    fetch: async (http: ConnectorHttp, authorization: string, from: Stream) =>
      summarize(await fetchProjectUpdates(http, authorization, from), projectUpdateToItem),
  },
] as const;

export const linearConnector: Connector<Config> = {
  id: 'linear',
  configSchema,
  secretFields: ['apiKey'],
  hosts: () => ['api.linear.app'],
  oauth: linearOAuth,

  async verify(config, http) {
    return { account: await fetchAccount(http, authorizationOf(config)) };
  },

  async *sync(config, { cursor, since }, http): AsyncGenerator<SyncPage> {
    const authorization = authorizationOf(config);
    let state = readCursor(cursor, since);
    for (const { key, fetch } of STREAMS) {
      for (;;) {
        const current = state[key];
        let page: Fetched;
        try {
          page = await fetch(http, authorization, current);
        } catch (error) {
          if (key === 'updates' && error instanceof ConnectorAuthError && error.status === 403)
            break;
          throw error;
        }
        const top = newest([current.top, page.latest]);
        const moved: Stream =
          page.next === null
            ? { from: top ?? current.from, top: null, after: null } // parcours terminé
            : { from: current.from, top, after: page.next };
        const before = JSON.stringify(state);
        state = { ...state, [key]: moved };
        const after = JSON.stringify(state);
        // Une page sans élément ne se rend que si elle fait avancer le curseur.
        if (page.items.length > 0 || after !== before) yield { items: page.items, cursor: after };
        if (page.next === null) break;
      }
    }
  },
};
