import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';
import type { Connector, ConnectorItem, SyncPage, SyncState } from '../types';
import { type TrelloClient, trelloClient } from './client';
import {
  apiTime,
  type Cursor,
  compareIds,
  isDone,
  readCursor,
  type Touched,
  touchedCards,
} from './cursor';
import { toItem } from './map';

// Doc lue le 15/10/2026 :
//   https://developer.atlassian.com/cloud/trello/guides/rest-api/api-introduction/
//   https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/
//   https://developer.atlassian.com/cloud/trello/guides/rest-api/rate-limits/
//   https://developer.atlassian.com/cloud/trello/guides/rest-api/nested-resources/
//   https://developer.atlassian.com/cloud/trello/guides/rest-api/action-types/
//   https://developer.atlassian.com/cloud/trello/guides/rest-api/object-definitions/
//   https://dac-static.atlassian.com/cloud/trello/swagger.v3.json (paramètres des points d'accès)
// Choix qui diffèrent du plan, d'après la doc : la clé et le jeton passent par l'en-tête
// « Authorization: OAuth oauth_consumer_key="…", oauth_token="…" » que la doc décrit, pas par les
// paramètres key et token : ils ne sont ainsi jamais dans une adresse. Trello limite chaque jeton à
// 100 requêtes par 10 secondes (et 100 par 15 minutes pour /members) : une requête toutes les 150 ms.
// Trello ne trie pas les actions par date croissante (la plus récente d'abord) : on lit toutes les
// actions depuis le curseur, on les regroupe par carte, puis on rend les cartes de la moins à la plus
// récemment modifiée. Le curseur d'un tableau est (date de la dernière action, identifiant de la
// carte), pour départager deux cartes touchées au même instant.
// Une carte supprimée (404) ou refusée (401, 403) est ignorée : Trello répond 401 pour une carte
// dont l'accès a été retiré. Un 401 ou 403 sur la liste des tableaux ou leurs actions remonte. Les
// listes refusées donnent des cartes sans nom de liste. La description sans texte n'est pas un tour.
//
// Non vérifié : l'ordre des actions (la doc ne le dit pas : la plus récente d'abord, d'après l'usage
// connu) ; que `since` accepte une date sans millisecondes (la doc la décrit ainsi) et que `before`
// accepte l'identifiant d'une action ; la forme de `data` d'un commentaire (data.text, data.card.id :
// la doc n'en donne pas d'exemple) ; que le paramètre `actions` d'une carte accepte plusieurs types ;
// le code rendu pour une carte inaccessible. Limites connues : un commentaire modifié n'est pas
// repéré avant la prochaine action de la carte (l'action updateComment n'est pas listable) ; au-delà
// de 1000 commentaires sur une carte, seuls les plus récents sont lus ; la liste d'un tableau n'est
// pas dans le texte du tour (elle est dans `origin.list`).

const CARDS_PER_PAGE = 50;

const Credential = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,200}$/);
const ConfigSchema = z.object({ apiKey: Credential, token: Credential });
type Config = z.infer<typeof ConfigSchema>;

async function listNames(trello: TrelloClient, boardId: string): Promise<Map<string, string>> {
  try {
    return new Map((await trello.lists(boardId)).map((list) => [list.id, list.name]));
  } catch (error) {
    if (error instanceof ConnectorAuthError) return new Map();
    throw error;
  }
}

async function readCard(
  trello: TrelloClient,
  board: string,
  lists: Map<string, string>,
  touched: Touched,
): Promise<ConnectorItem | null> {
  let card: Awaited<ReturnType<TrelloClient['card']>>;
  try {
    card = await trello.card(touched.id);
  } catch (error) {
    const gone = error instanceof ConnectorHttpError && error.status === 404;
    if (gone || error instanceof ConnectorAuthError) return null;
    throw error;
  }
  const list = lists.get(card.idList ?? '') ?? null;
  return toItem({ board, list, card, updatedAt: touched.at });
}

async function* syncBoards(trello: TrelloClient, state: SyncState): AsyncGenerator<SyncPage> {
  const cursor = readCursor(state.cursor);
  const boards = (await trello.boards()).sort((a, b) => compareIds(a.id, b.id));
  const marks: Cursor = {}; // seulement les tableaux d'aujourd'hui
  for (const { id } of boards) if (cursor[id]) marks[id] = cursor[id];
  for (const board of boards) {
    const mark = marks[board.id];
    const from = mark ? new Date(Date.parse(mark.at) - 1000) : state.since;
    const todo = touchedCards(await trello.actions(board.id, apiTime(from))).filter(
      (card) => !isDone(mark, card),
    );
    if (todo.length === 0) continue;
    const lists = await listNames(trello, board.id);
    for (let start = 0; start < todo.length; start += CARDS_PER_PAGE) {
      const chunk = todo.slice(start, start + CARDS_PER_PAGE);
      const items: ConnectorItem[] = [];
      for (const touched of chunk) {
        const item = await readCard(trello, board.name, lists, touched);
        if (item) items.push(item);
      }
      const last = chunk[chunk.length - 1] as Touched;
      marks[board.id] = { at: last.at, id: last.id };
      yield { items, cursor: JSON.stringify(marks) };
    }
  }
}

export const trelloConnector: Connector<Config> = {
  id: 'trello',
  configSchema: ConfigSchema,
  secretFields: ['token'],
  hosts: () => ['api.trello.com'],
  minIntervalMs: 150,

  async verify(config: Config, http: ConnectorHttp) {
    const trello = trelloClient(config, http);
    const me = await trello.account();
    const count = (await trello.boards()).length;
    const name = me.fullName?.trim() || me.username;
    return { account: `${name} (@${me.username}), ${count} tableau${count > 1 ? 'x' : ''}` };
  },

  sync(config: Config, state: SyncState, http: ConnectorHttp) {
    return syncBoards(trelloClient(config, http), state);
  },
};
