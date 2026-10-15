import { z } from 'zod';
import type { ConnectorHttp } from '../http';

// Les requêtes vers l'API REST de Trello et la forme des réponses lues (seulement les champs utiles).

const API = 'https://api.trello.com/1';
// Le maximum de Trello est 1000 actions par réponse. 500 garde une réponse sous les 10 Mo du client
// même si chaque commentaire est très long (un commentaire fait 16 384 caractères au plus).
export const ACTIONS_PER_PAGE = 500;
const CARD_ACTIONS_MAX = 1000;

const Board = z.object({ id: z.string(), name: z.string() });
const List = z.object({ id: z.string(), name: z.string() });
const Member = z.object({ fullName: z.string().nullish(), username: z.string().nullish() });

// Une action d'un tableau : seule la carte touchée et la date comptent ici.
const BoardAction = z.object({
  id: z.string(),
  date: z.string(),
  data: z.object({ card: z.object({ id: z.string() }).nullish() }).nullish(),
});
export type CardRef = { cardId: string; date: string };

const CardAction = z.object({
  id: z.string(),
  type: z.string(),
  date: z.string(),
  data: z.object({ text: z.string().nullish() }).nullish(),
  memberCreator: Member.nullish(), // absent quand le compte a été supprimé
});
export type CardAction = z.infer<typeof CardAction>;

const Card = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string().nullish(),
  url: z.string().nullish(),
  shortUrl: z.string().nullish(),
  idList: z.string().nullish(),
  actions: z.array(CardAction).nullish(),
});
export type Card = z.infer<typeof Card>;

type Query = Record<string, string | number | boolean | undefined>;

export function trelloClient(credentials: { apiKey: string; token: string }, http: ConnectorHttp) {
  // L'en-tête documenté par Trello : la clé et le jeton ne passent jamais par l'adresse.
  const headers = {
    Authorization: `OAuth oauth_consumer_key="${credentials.apiKey}", oauth_token="${credentials.token}"`,
  };
  const get = <T>(path: string, query: Query, schema: z.ZodType<T>) =>
    http.json({ url: `${API}${path}`, headers, query }, schema);

  return {
    account: () =>
      get('/members/me', { fields: 'fullName,username' }, Member.extend({ username: z.string() })),
    boards: () => get('/members/me/boards', { filter: 'open', fields: 'name' }, z.array(Board)),
    lists: (boardId: string) =>
      get(`/boards/${boardId}/lists`, { filter: 'all', fields: 'name' }, z.array(List)),

    // Les cartes touchées depuis `since` (AAAA-MM-JJTHH:MM:SSZ). Trello rend les actions de la plus
    // récente à la plus ancienne : on enchaîne les pages avec `before`, jusqu'à une page incomplète.
    async actions(boardId: string, since: string): Promise<CardRef[]> {
      const refs: CardRef[] = [];
      let before: string | undefined;
      for (;;) {
        const page = await get(
          `/boards/${boardId}/actions`,
          {
            filter: 'commentCard,createCard,updateCard',
            since,
            limit: ACTIONS_PER_PAGE,
            memberCreator: false,
            before,
          },
          z.array(BoardAction),
        );
        for (const action of page) {
          if (action.data?.card) refs.push({ cardId: action.data.card.id, date: action.date });
        }
        const oldest = page.reduce(
          (min, action) => (action.id < min ? action.id : min),
          page[0]?.id ?? '',
        );
        // Garde-fou : une page qui ne recule pas ne ferait que boucler.
        if (page.length < ACTIONS_PER_PAGE || (before !== undefined && oldest >= before))
          return refs;
        before = oldest;
      }
    },

    // La carte, ses commentaires et sa création (donc son auteur) en une seule requête.
    card: (cardId: string) =>
      get(
        `/cards/${cardId}`,
        {
          fields: 'name,desc,url,shortUrl,idList',
          actions: 'commentCard,createCard',
          actions_limit: CARD_ACTIONS_MAX,
        },
        Card,
      ),
  };
}

export type TrelloClient = ReturnType<typeof trelloClient>;
