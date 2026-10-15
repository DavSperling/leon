import { z } from 'zod';
import { PROVIDER_LABELS } from '@/lib/providers';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';
import type { Connector, ConnectorItem, SyncPage } from '../types';
import { fetchAccount, fetchBoardIds, fetchItems } from './client';
import { itemToConnectorItem, toIso } from './map';
import { mondayOAuth } from './oauth';
import type { ItemsPage, MondayItem } from './queries';

// Doc lue le 15/10/2026 (https://developer.monday.com/api-reference/) :
//   docs/authentication (POST /v2, en-tête Authorization avec le jeton seul, sans « Bearer »),
//   docs/api-versioning (en-tête API-Version ; 2026-07 est la version courante et stable),
//   docs/rate-limits (5 M de points par requête, 10 M par minute en jeton personnel, 1 M en gratuit ;
//   1 000 appels par jour jusqu'à Standard, 10 000 en Pro), docs/errors (erreurs dans
//   `errors[].extensions.code`), reference/items-page, next-items-page (curseur valable 60 minutes),
//   items-page-other-types (order_by __last_updated__ asc|desc), last-updated (la sélection sur
//   __last_updated__ n'accepte que des périodes : TODAY, THIS_WEEK…, jamais un instant), boards,
//   updates, replies, me, account, column-values-v2.
//
// Écart au plan : « filtrés sur la dernière mise à jour si l'API le permet ». Elle ne le permet pas
// pour un instant, ni la date de création. On trie donc chaque tableau du plus récemment modifié au
// plus ancien et on s'arrête au premier élément qui n'a pas changé depuis `from` (comme Linear).
// `from` est le début du passage précédent moins 5 minutes : un élément modifié pendant un passage,
// une fois son tableau lu, est repris au suivant ; l'ingestion ignore ce qu'elle connaît déjà.
// Le corps d'un élément (le plan ne le dit pas) est son nom suivi de ses colonnes remplies, sans les
// dates automatiques ; les mises à jour (les 25 plus récentes) et leurs réponses sont des tours de
// participants. Sans colonne remplie ni mise à jour, l'élément n'est pas rendu. Ne sont pas lus :
// les sous-éléments, les documents, les tableaux à niveaux multiples. Un 403 ou un tableau devenu
// introuvable ne fait perdre que ce tableau ; sur la liste des tableaux, un 401 ou un 403 remonte.
//
// Non vérifié (aucune clé réelle) : le format des dates des éléments et des mises à jour (la doc n'en
// montre pas ; « …Z », « …+00:00 » et « … UTC » sont lus) ; le code d'une clé refusée dans une
// réponse 200 ; le code d'un curseur expiré (CursorException, d'après le forum de l'éditeur) ; les
// types de colonne écartés (name, last_updated, creation_log, file, button, subtasks, item_id) ; si
// publier une mise à jour change la date de modification de l'élément (le forum dit que non : un
// commentaire ajouté sans autre changement ne serait vu qu'à la prochaine modification de l'élément) ;
// si `boards` rend tous les tableaux visibles du jeton, et son plafond de `limit` (50 demandés).

// Deux façons de se brancher : le jeton personnel collé (une connexion sans `authMode` est à clé) ou
// le bouton, dont le socle OAuth tient les jetons. Un `z.object` raffiné : le catalogue lit `.shape`.
const configSchema = z
  .object({
    authMode: z.enum(['key', 'oauth']).default('key'),
    token: z.string().trim().min(1).optional(),
    accessToken: z.string().trim().min(1).optional(),
    refreshToken: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
  })
  .superRefine((config, ctx) => {
    const field = config.authMode === 'oauth' ? 'accessToken' : 'token';
    if (!config[field]) ctx.addIssue({ code: 'custom', path: [field], message: 'Requis' });
  });
type Config = z.infer<typeof configSchema>;

// Le jeton d'accès du bouton et le jeton personnel s'envoient tous deux tels quels, sans « Bearer »
// (en-tête Authorization de api.monday.com/v2). Le schéma garantit que l'un des deux existe.
function tokenOf(config: Config): string {
  const token = config.authMode === 'oauth' ? config.accessToken : config.token;
  if (token === undefined) throw new ConnectorAuthError(PROVIDER_LABELS.monday);
  return token;
}

// Où en est le passage : `from` (les éléments modifiés après cette date), `started` (son début),
// `boards` (les tableaux qui restent à lire, `null` hors passage) et `after` (le curseur de l'outil
// dans le premier de ces tableaux).
const roundSchema = z.object({
  from: z.iso.datetime(),
  started: z.iso.datetime().nullable(),
  boards: z.array(z.string()).nullable(),
  after: z.string().nullable(),
});
type Round = z.infer<typeof roundSchema>;

const CLOCK_MARGIN_MS = 5 * 60_000; // écart d'horloge entre l'outil et nous, délai de mise à jour

// Un curseur illisible repart de `since` : l'ingestion est idempotente, au pire on refait du travail.
function readCursor(raw: string | null, since: Date): Round {
  let value: unknown = null;
  try {
    value = raw === null ? null : JSON.parse(raw);
  } catch {
    value = null;
  }
  const parsed = roundSchema.safeParse(value);
  const fresh = { from: since.toISOString(), started: null, boards: null, after: null };
  return parsed.success ? parsed.data : fresh;
}

function endRound(state: Round): Round {
  const started = Date.parse(state.started ?? new Date().toISOString());
  const from = new Date(started - CLOCK_MARGIN_MS).toISOString();
  return { from, started: null, boards: null, after: null };
}

function nextBoard(state: Round): Round {
  const rest = (state.boards ?? []).slice(1);
  return rest.length > 0 ? { ...state, boards: rest, after: null } : endRound(state);
}

// Les éléments arrivent du plus récent au plus ancien : on s'arrête au premier qui n'a pas changé
// depuis `from`. Un élément sans date lisible passe son chemin (le rendu l'écarte).
function changedSince(page: ItemsPage, from: string) {
  const fresh: MondayItem[] = [];
  for (const item of page.items) {
    const at = toIso(item.updated_at ?? item.created_at);
    if (at !== null && Date.parse(at) <= Date.parse(from)) return { fresh, caughtUp: true };
    fresh.push(item);
  }
  return { fresh, caughtUp: false };
}

const hasStatus = (error: unknown, status: number) =>
  error instanceof ConnectorHttpError && error.status === status;

type Step = { items: ConnectorItem[]; next: Round };

async function readBoard(
  http: ConnectorHttp,
  token: string,
  boardId: string,
  state: Round,
): Promise<Step> {
  let page: ItemsPage;
  try {
    page = await fetchItems(http, token, boardId, state.after);
  } catch (error) {
    // Curseur expiré : le tableau repart du début (l'ingestion ignore ce qu'elle connaît déjà).
    if (state.after !== null && hasStatus(error, 410)) {
      return { items: [], next: { ...state, after: null } };
    }
    const forbidden = error instanceof ConnectorAuthError && error.status === 403;
    if (forbidden || hasStatus(error, 404)) return { items: [], next: nextBoard(state) };
    throw error;
  }
  const { fresh, caughtUp } = changedSince(page, state.from);
  const items = fresh.flatMap((item) => itemToConnectorItem(item) ?? []);
  const done = caughtUp || page.cursor === null || page.items.length === 0;
  return { items, next: done ? nextBoard(state) : { ...state, after: page.cursor } };
}

export const mondayConnector: Connector<Config> = {
  id: 'monday',
  configSchema,
  secretFields: ['token'],
  hosts: () => ['api.monday.com'],
  oauth: mondayOAuth,

  async verify(config, http) {
    return { account: await fetchAccount(http, tokenOf(config)) };
  },

  async *sync(config, { cursor, since }, http): AsyncGenerator<SyncPage> {
    const token = tokenOf(config);
    let state = readCursor(cursor, since);
    if (state.boards === null) {
      // Le début du passage se note avant la première lecture.
      const started = new Date().toISOString();
      state = { ...state, started, boards: await fetchBoardIds(http, token) };
    }
    for (;;) {
      const boardId = state.boards?.[0];
      const step: Step =
        boardId === undefined
          ? { items: [], next: endRound(state) }
          : await readBoard(http, token, boardId, state);
      yield { items: step.items, cursor: JSON.stringify(step.next) };
      if (step.next.boards === null) return;
      state = step.next;
    }
  },
};
