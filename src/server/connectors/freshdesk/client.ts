import { z } from 'zod';
import type { ConnectorHttp, HttpRequest } from '../http';
import { apiTime } from './cursor';

// Les requêtes vers l'API v2 de Freshdesk et la forme des réponses lues (seulement les champs utiles).

export type FreshdeskAccess = { domain: string; apiKey: string };
export type Person = { name: string | null; email: string | null };

const TICKETS_PER_PAGE = 50; // chaque ticket coûte une requête de plus (ses conversations)
const PAGES_MAX = 300; // la limite de Freshdesk pour une liste de tickets

// Freshdesk date en UTC, « AAAA-MM-JJTHH:MM:SSZ » : une date sans fuseau serait lue dans celui du serveur.
const DateText = z.iso.datetime({ offset: true });

const RequesterSchema = z.object({
  id: z.number(),
  name: z.string().nullish(),
  email: z.string().nullish(),
});
export const TicketSchema = z.object({
  id: z.number(),
  subject: z.string().nullish(),
  description: z.string().nullish(), // HTML ; absent sans include=description
  description_text: z.string().nullish(),
  requester: RequesterSchema.nullish(), // include=requester ; nul quand le contact a été supprimé
  group_id: z.number().nullish(),
  company_id: z.number().nullish(),
  updated_at: DateText,
});
export const ConversationSchema = z.object({
  id: z.number(),
  body: z.string().nullish(), // HTML
  body_text: z.string().nullish(),
  private: z.boolean().nullish(), // une note interne
  user_id: z.number().nullish(), // l'agent ou le contact qui l'a écrite
  from_email: z.string().nullish(),
  created_at: DateText,
});
const AgentSchema = z.object({
  id: z.number(),
  contact: z.object({ name: z.string().nullish(), email: z.string().nullish() }).nullish(),
});

export type Ticket = z.infer<typeof TicketSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
type Agent = z.infer<typeof AgentSchema>;

export const personOf = (agent: Agent): Person => ({
  name: agent.contact?.name?.trim() || null,
  email: agent.contact?.email?.trim() || null,
});

export function freshdeskClient(access: FreshdeskAccess, http: ConnectorHttp) {
  const base = `https://${access.domain}.freshdesk.com/api/v2`;
  // Authentification de base : la clé comme identifiant, n'importe quoi comme mot de passe.
  const headers = {
    Authorization: `Basic ${Buffer.from(`${access.apiKey}:X`).toString('base64')}`,
  };

  // Une liste, page par page, en suivant l'en-tête Link (absent sur la dernière page).
  async function* pagesOf<T>(first: HttpRequest, schema: z.ZodType<T[]>): AsyncGenerator<T[]> {
    let request = first;
    for (let number = 0; number < PAGES_MAX; number++) {
      const { data, nextUrl } = await http.page(request, schema);
      yield data;
      if (nextUrl === null) return;
      request = { url: nextUrl, headers };
    }
  }

  return {
    // L'agent à qui appartient la clé.
    me: () => http.json({ url: `${base}/agents/me`, headers }, AgentSchema),

    // Les agents du compte, par identifiant : une conversation ne donne que l'identifiant de son auteur.
    async agents(): Promise<Map<number, Person>> {
      const people = new Map<number, Person>();
      for await (const rows of pagesOf({ url: `${base}/agents`, headers }, z.array(AgentSchema))) {
        for (const agent of rows) people.set(agent.id, personOf(agent));
      }
      return people;
    },

    // Les tickets modifiés depuis `from`, du plus ancien au plus récent. Sans `updated_since`, Freshdesk
    // ne rend que les 30 derniers jours ; les tickets supprimés ou en spam ne sont jamais rendus.
    tickets: (from: Date) =>
      pagesOf(
        {
          url: `${base}/tickets`,
          headers,
          query: {
            updated_since: apiTime(from),
            order_by: 'updated_at',
            order_type: 'asc',
            include: 'requester,description',
            per_page: TICKETS_PER_PAGE,
          },
        },
        z.array(TicketSchema),
      ),

    async conversations(ticketId: number): Promise<Conversation[]> {
      const rows: Conversation[] = [];
      const first = { url: `${base}/tickets/${ticketId}/conversations`, headers };
      for await (const page of pagesOf(first, z.array(ConversationSchema))) rows.push(...page);
      return rows;
    },
  };
}

export type FreshdeskClient = ReturnType<typeof freshdeskClient>;
