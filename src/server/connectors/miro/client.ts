import { z } from 'zod';
import type { ConnectorHttp } from '../http';

// Les requêtes vers l'API de Miro et la forme des réponses lues (seulement les champs utiles).

const API = 'https://api.miro.com';
export const BOARDS_PER_PAGE = 50; // le maximum de Miro
export const ITEMS_PER_PAGE = 50; // idem (de 10 à 50)
// Un tableau de plus de 1 000 éléments n'est lu que jusque-là : le reste est ignoré.
export const ITEM_PAGES_MAX = 20;

// Miro écrit « 2022-03-30T17:26:50Z » dans le modèle de son SDK, et « 2022-03-30 17:26:50+00:00 »
// dans l'exemple de sa référence : les deux sont lues, un fuseau explicite est exigé.
const DATE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

export function timeOf(text: string | null | undefined): number | null {
  if (!text || !DATE.test(text)) return null;
  const time = Date.parse(text.replace(' ', 'T'));
  return Number.isNaN(time) ? null : time;
}

const Named = z.object({ name: z.string().nullish() }).nullish();

const BoardSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  viewLink: z.string().nullish(),
  owner: Named,
  team: Named,
  project: Named,
  createdAt: z.string().nullish(),
  modifiedAt: z.string().nullish(),
});

// `time` : la dernière modification (à défaut, la création), en millisecondes.
export type Board = Omit<z.infer<typeof BoardSchema>, 'createdAt' | 'modifiedAt'> & {
  time: number;
};

// Un champ du mauvais type (selon le type d'élément) est ignoré plutôt que de refuser la page.
const Text = z.string().nullish().catch(null);

export const ItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({ content: Text, title: Text, description: Text }).nullish().catch(null),
  parent: z.object({ id: z.string() }).nullish().catch(null),
});
export type BoardItem = z.infer<typeof ItemSchema>;

const Identified = z.object({ id: z.string().nullish(), name: z.string().nullish() }).nullish();
const TokenContext = z.object({ user: Identified, team: Identified });
const BoardsReply = z.object({ data: z.array(BoardSchema) });
const ItemsReply = z.object({
  data: z.array(ItemSchema).default([]),
  cursor: z.string().nullish(),
});

export function miroClient(accessToken: string, http: ConnectorHttp) {
  const headers = { Authorization: `Bearer ${accessToken}` };

  return {
    // GET /v1/oauth-token : l'utilisateur et l'équipe du jeton.
    async account(): Promise<{ account: string; accountKey?: string }> {
      const context = await http.json({ url: `${API}/v1/oauth-token`, headers }, TokenContext);
      const names = [context.user?.name, context.team?.name].filter(Boolean);
      const account = names.length === 2 ? `${names[0]} (${names[1]})` : (names[0] ?? 'Miro');
      const ids = [context.user?.id, context.team?.id].filter(Boolean);
      return context.user?.id ? { account, accountKey: ids.join(':') } : { account };
    },

    // Tous les tableaux de l'équipe, dans l'ordre de création : il ne bouge pas quand un tableau est
    // modifié pendant la lecture, alors que la liste est lue par décalage. Un tableau sans date n'est
    // pas rendu. Sans équipe, Miro rend tous les tableaux du compte, et ignore `sort`.
    async boards(teamId: string | null): Promise<Board[]> {
      const seen = new Set<string>();
      const boards: Board[] = [];
      for (let offset = 0; ; offset += BOARDS_PER_PAGE) {
        const reply = await http.json(
          {
            url: `${API}/v2/boards`,
            headers,
            query: {
              team_id: teamId ?? undefined,
              sort: 'last_created',
              limit: BOARDS_PER_PAGE,
              offset,
            },
          },
          BoardsReply,
        );
        const known = seen.size;
        for (const { createdAt, modifiedAt, ...board } of reply.data) {
          if (seen.has(board.id)) continue;
          seen.add(board.id);
          const time = timeOf(modifiedAt ?? createdAt);
          if (time !== null) boards.push({ ...board, time });
        }
        // Une page courte est la dernière ; une page sans nouveauté : l'outil ignore le décalage.
        if (reply.data.length < BOARDS_PER_PAGE || seen.size === known) return boards;
      }
    },

    // Les éléments du tableau, 50 à la fois, par le curseur de Miro (pas de filtre par date).
    async items(boardId: string): Promise<BoardItem[]> {
      const found: BoardItem[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < ITEM_PAGES_MAX; page++) {
        const reply = await http.json(
          {
            url: `${API}/v2/boards/${encodeURIComponent(boardId)}/items`,
            headers,
            query: { limit: ITEMS_PER_PAGE, cursor },
          },
          ItemsReply,
        );
        found.push(...reply.data);
        if (!reply.cursor || reply.cursor === cursor) break;
        cursor = reply.cursor;
      }
      return found;
    },
  };
}

export type MiroClient = ReturnType<typeof miroClient>;
