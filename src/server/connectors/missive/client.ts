import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';
import {
  BodiesSchema,
  type Comment,
  CommentsSchema,
  type Conversation,
  ConversationsSchema,
  type Message,
  MessagesSchema,
  OrganizationsSchema,
  TeamsSchema,
  UsersSchema,
} from './schemas';

// Les requêtes vers l'API de Missive. Les listes (conversations, messages, commentaires) ne se
// lisent que du plus récent au plus ancien : `until` reprend à la date du plus ancien déjà lu.

const API = 'https://public.missiveapp.com/v1';
const CONVERSATIONS_LIMIT = 50; // le maximum de la liste des conversations
const THREAD_LIMIT = 10; // le maximum des messages et des commentaires, et nos groupes de corps

// Un refus (403) ou une ressource disparue (404) laisse la valeur de repli : ce n'est pas la clé qui
// est en cause. Un invité d'une conversation n'a pas accès à ses messages.
export async function tolerate<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    const denied = error instanceof ConnectorAuthError && error.status === 403;
    const missing = error instanceof ConnectorHttpError && error.status === 404;
    if (denied || missing) return fallback;
    throw error;
  }
}

// Toutes les lignes jusqu'à `floor` au moins (la dernière page lue peut descendre plus bas).
// Dernière page : moins de `limit` lignes, ou toutes à la même date (règle de la doc) ; rien de neuf
// (la date de reprise est incluse) arrête aussi la lecture.
async function readBack<T extends { id: string }>(
  readPage: (until: number | undefined) => Promise<T[]>,
  timeOf: (row: T) => number,
  limit: number,
  floor = Number.NEGATIVE_INFINITY,
): Promise<T[]> {
  const rows = new Map<string, T>();
  let until: number | undefined;
  for (;;) {
    const page = await readPage(until);
    const before = rows.size;
    for (const row of page) rows.set(row.id, row);
    const times = page.map(timeOf);
    const oldest = Math.min(...times);
    const last = page.length < limit || oldest === Math.max(...times) || rows.size === before;
    if (last || oldest < floor) return [...rows.values()];
    until = oldest;
  }
}

export function missiveClient({ token }: { token: string }, http: ConnectorHttp) {
  const headers = { authorization: `Bearer ${token}` };
  const encode = encodeURIComponent;

  async function bodies(ids: string[]): Promise<Map<string, string | null>> {
    const url = `${API}/messages/${ids.map(encode).join(',')}`;
    const { messages } = await http.json({ url, headers }, BodiesSchema);
    // Un seul identifiant (une conversation d'un message, ou un dernier groupe d'un) rend un objet.
    const list = Array.isArray(messages) ? messages : [messages];
    return new Map(list.map((message) => [message.id, message.body ?? null]));
  }

  async function teams() {
    const query = { limit: 200 };
    return (await http.json({ url: `${API}/teams`, headers, query }, TeamsSchema)).teams;
  }

  function teamConversations(teamId: string, from: number): Promise<Conversation[]> {
    return readBack(
      async (until) => {
        const query = { team_all: teamId, limit: CONVERSATIONS_LIMIT, until };
        const request = { url: `${API}/conversations`, headers, query };
        return (await http.json(request, ConversationsSchema)).conversations;
      },
      (conversation) => conversation.last_activity_at,
      CONVERSATIONS_LIMIT,
      from,
    );
  }

  return {
    async users() {
      const query = { limit: 200 };
      return (await http.json({ url: `${API}/users`, headers, query }, UsersSchema)).users;
    },

    async organizations() {
      const query = { limit: 200 };
      return (await http.json({ url: `${API}/organizations`, headers, query }, OrganizationsSchema))
        .organizations;
    },

    teams,

    // Les conversations de la boîte « Tout » de chaque équipe, du plus récent jusqu'à `from`
    // (secondes Unix), sans doublon : une conversation partagée avec deux équipes est lue une fois.
    // La boîte « Tous » de l'utilisateur n'est pas lue : elle contient son courrier personnel, que
    // Leon rendrait visible de toute l'équipe. Une équipe que le jeton ne peut pas lire est laissée.
    async conversations(from: number): Promise<Conversation[]> {
      const found = new Map<string, Conversation>();
      for (const team of await teams()) {
        const rows = await tolerate(() => teamConversations(team.id, from), []);
        for (const row of rows) if (!found.has(row.id)) found.set(row.id, row);
      }
      return [...found.values()];
    },

    // Les messages (du plus récent au plus ancien), avec leur corps. Un corps refusé (403) laisse
    // l'aperçu du message.
    async messages(conversationId: string): Promise<Message[]> {
      const url = `${API}/conversations/${encode(conversationId)}/messages`;
      const list = await readBack(
        async (until) => {
          const query = { limit: THREAD_LIMIT, until };
          return (await http.json({ url, headers, query }, MessagesSchema)).messages;
        },
        (message) => message.delivered_at,
        THREAD_LIMIT,
      );
      const texts = new Map<string, string | null>();
      for (let start = 0; start < list.length; start += THREAD_LIMIT) {
        const ids = list.slice(start, start + THREAD_LIMIT).map((message) => message.id);
        for (const [id, body] of await tolerate(
          () => bodies(ids),
          new Map<string, string | null>(),
        )) {
          texts.set(id, body);
        }
      }
      return list.map((message) => ({ ...message, body: texts.get(message.id) ?? null }));
    },

    comments(conversationId: string): Promise<Comment[]> {
      const url = `${API}/conversations/${encode(conversationId)}/comments`;
      return readBack(
        async (until) => {
          const query = { limit: THREAD_LIMIT, until };
          return (await http.json({ url, headers, query }, CommentsSchema)).comments;
        },
        (comment) => comment.created_at,
        THREAD_LIMIT,
      );
    },
  };
}

export type MissiveClient = ReturnType<typeof missiveClient>;
