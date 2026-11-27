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
const Webhook = z.object({ id: z.string().min(1).max(100) });

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
  due: z.string().nullish(),
  dueComplete: z.boolean().nullish(),
  labels: z.array(z.object({ name: z.string().nullish() })).nullish(),
  members: z.array(z.object({ fullName: z.string().nullish() })).nullish(),
  actions: z.array(CardAction).nullish(),
});
export type Card = z.infer<typeof Card>;

type Query = Record<string, string | number | boolean | undefined>;

// La clé et le jeton collés à la main, ou le jeton d'accès du bouton (`authMode: 'oauth'`).
type Credentials = { authMode?: string; apiKey?: string; token?: string; accessToken?: string };

export function trelloClient(credentials: Credentials, http: ConnectorHttp) {
  // Le seul point d'authentification du client, pour chaque requête : le jeton du bouton en Bearer, sinon l'en-tête
  // documenté par Trello pour une clé. Ni la clé ni un jeton ne passent jamais par l'adresse.
  const headers = {
    Authorization:
      credentials.authMode === 'oauth'
        ? `Bearer ${credentials.accessToken}`
        : `OAuth oauth_consumer_key="${credentials.apiKey}", oauth_token="${credentials.token}"`,
  };
  const get = <T>(path: string, query: Query, schema: z.ZodType<T>) =>
    http.json({ url: `${API}${path}`, headers, query }, schema);

  return {
    // Un webhook sur un tableau (connexion par bouton) : Trello essaie d'abord `callbackURL` par un HEAD, qui doit
    // répondre 200. Une écriture qu'on ne rejoue pas : la relève suivante réessaie.
    createWebhook: (idModel: string, callbackURL: string) =>
      http.json(
        {
          url: `${API}/webhooks`,
          method: 'POST',
          headers,
          body: { idModel, callbackURL, description: 'Leon' },
          once: true,
        },
        Webhook,
      ),
    account: () =>
      get(
        '/members/me',
        { fields: 'fullName,username' },
        Member.extend({ id: z.string(), username: z.string() }),
      ),
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

    // La carte, ses membres, ses commentaires et sa création (donc son auteur) en une seule requête.
    card: (cardId: string) =>
      get(
        `/cards/${cardId}`,
        {
          fields: 'name,desc,url,shortUrl,idList,due,dueComplete,labels',
          members: true,
          member_fields: 'fullName',
          actions: 'commentCard,createCard',
          actions_limit: CARD_ACTIONS_MAX,
        },
        Card,
      ),
  };
}

export type TrelloClient = ReturnType<typeof trelloClient>;
