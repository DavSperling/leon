import { z } from 'zod';
import type { ConnectorHttp } from '../http';

// Les requêtes vers l'API REST d'Intercom et la forme des réponses lues (seulement les champs
// utiles ; Intercom ajoute des champs d'une version à l'autre).

// La version est épinglée : sans l'en-tête, Intercom prend celle choisie dans les réglages de l'appli.
const API_VERSION = '2.14';
const PAGE_SIZE = 100;

// Intercom donne ses numéros tantôt en texte, tantôt en nombre.
const Id = z.union([z.string(), z.number()]).transform(String);

const AuthorSchema = z.object({
  type: z.string().nullish(), // admin, user, lead, contact, bot, team
  id: Id.nullish(),
  name: z.string().nullish(), // nul pour un contact archivé ou supprimé
  email: z.string().nullish(),
  from_ai_agent: z.boolean().nullish(),
  is_ai_answer: z.boolean().nullish(),
});
const SourceSchema = z.object({
  type: z.string().nullish(), // conversation, email, sms, phone_call…
  subject: z.string().nullish(),
  body: z.string().nullish(), // HTML
  author: AuthorSchema.nullish(),
  redacted: z.boolean().nullish(),
});
const PartSchema = z.object({
  id: Id,
  part_type: z.string(), // comment, note, assignment, close…
  body: z.string().nullish(), // HTML ; nul pour une affectation ou une fermeture
  created_at: z.number(), // secondes depuis 1970
  author: AuthorSchema.nullish(), // absent de la doc de la version 2.14, présent dans celle de la 2.4
  redacted: z.boolean().nullish(),
});

// La même forme pour la recherche (sans parties) et pour le détail (avec parties et équipiers).
export const ConversationSchema = z.object({
  id: Id,
  title: z.string().nullish(),
  created_at: z.number(),
  updated_at: z.number(),
  team_assignee_id: Id.nullish(),
  source: SourceSchema.nullish(),
  teammates: z.object({ teammates: z.array(AuthorSchema) }).nullish(),
  conversation_parts: z.object({ conversation_parts: z.array(PartSchema) }).nullish(),
});
const SearchReply = z.object({
  conversations: z.array(ConversationSchema),
  pages: z.object({ next: z.object({ starting_after: z.string().nullish() }).nullish() }).nullish(),
});
const MeReply = z.object({
  name: z.string().nullish(),
  email: z.string().nullish(),
  app: z.object({ name: z.string().nullish() }).nullish(),
});

export type Author = z.infer<typeof AuthorSchema>;
export type Part = z.infer<typeof PartSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;

export function intercomClient(config: { token: string; region: string }, http: ConnectorHttp) {
  const api = `https://${config.region}`;
  const headers = { Authorization: `Bearer ${config.token}`, 'Intercom-Version': API_VERSION };

  return {
    async me(): Promise<{ name: string | null; workspace: string | null }> {
      const reply = await http.json({ url: `${api}/me`, headers }, MeReply);
      return {
        name: reply.name?.trim() || reply.email || null,
        workspace: reply.app?.name?.trim() || null,
      };
    },

    // Les conversations modifiées depuis `updatedAfter` (secondes ; la doc dit que « > » inclut la
    // borne), de la plus ancienne à la plus récente. `next` est le curseur de la page suivante,
    // absent de la dernière.
    async search(updatedAfter: number, startingAfter?: string, perPage = PAGE_SIZE) {
      const reply = await http.json(
        {
          url: `${api}/conversations/search`,
          method: 'POST',
          headers,
          body: {
            query: { field: 'updated_at', operator: '>', value: updatedAfter },
            sort: { field: 'updated_at', order: 'ascending' },
            pagination: {
              per_page: perPage,
              ...(startingAfter ? { starting_after: startingAfter } : {}),
            },
          },
        },
        SearchReply,
      );
      return {
        conversations: reply.conversations,
        next: reply.pages?.next?.starting_after ?? null,
      };
    },

    // Seul le détail porte les parties (messages et notes) : au plus les 500 plus récentes.
    conversation: (id: string) =>
      http.json(
        { url: `${api}/conversations/${encodeURIComponent(id)}`, headers },
        ConversationSchema,
      ),
  };
}

export type IntercomClient = ReturnType<typeof intercomClient>;
